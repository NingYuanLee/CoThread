import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import {
  queueConversationMessage,
  createConversationWindow,
} from "../server/conversation-memory-store.js";
import { processConversationWindow } from "../server/conversation-memory-runner.ts";
import { searchProjectMemory } from "../server/memory-search.ts";
import { supersedeMemoryEntry, confirmMemoryEntry } from "../server/memory-timeline.js";
import { getWikiPage } from "../server/wiki-pages.ts";
import { listMemoryHistory, readMemoryRevision } from "../server/memory-history.ts";
import {
  resolveMemorySourceFamily,
  sourceFamilyForSources,
  canSupersedeMemory,
} from "../server/memory-policy.ts";
import { upsertMemoryPage } from "../server/memory-pages.ts";
import { readProjectFacts } from "../server/project-facts.ts";
import { syncDocumentMemory } from "../server/document-memory.ts";
import { createVersion, replaceVersionContent } from "../server/documents/versions.ts";
import { loadTaskMemoryStats } from "../server/task-memory.ts";
import { callMcpTool } from "../server/mcp.js";
import { createTask } from "../server/task-commands.ts";
import { readTaskDecisionEvidence } from "../server/memory-decisions.ts";
import { createArtifact } from "../server/documents/versions.ts";
import { transaction } from "../server/db.ts";
import { askWikiQuestion } from "../server/wiki-questions.js";

async function setup() {
  const database = await testDatabase();
  const db = database.db,
    service = new Service(db),
    owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    owner.id + "@test.com",
    "A",
  ]);
  const project = await service.createProject(owner, { name: "按来源治理" });
  const threadId = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,'讨论',?)", [
    threadId,
    project.id,
    owner.id,
  ]);
  return { database, db, service, owner, project, threadId };
}
async function message(db, projectId, threadId, authorId, body) {
  const id = randomUUID();
  const result = await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
    [id, threadId, authorId, body],
  );
  await queueConversationMessage(db, projectId, threadId, result.insertId);
  return id;
}
async function settle(db, projectId, result) {
  const window = await createConversationWindow(db, { projectId, force: true });
  const outcome = await processConversationWindow(db, window.id, {
    analyze: async () => result,
    verifySupport: async () => true,
  });
  assert.equal(outcome.failed, 0);
}
test("来源权限不由五类标签或未知来源推定", () => {
  assert.equal(sourceFamilyForSources([{ kind: "message" }, { kind: "unknown" }]), null);
  assert.equal(sourceFamilyForSources([{ kind: "memory_page" }]), null);
  assert.equal(canSupersedeMemory({ sourceFamily: "conversation", actorType: "ai" }), false);
  assert.equal(canSupersedeMemory({ sourceFamily: "project_activity", actorType: "human" }), false);
  assert.equal(canSupersedeMemory({ sourceFamily: "project_file", actorType: "human" }), false);
  assert.equal(
    canSupersedeMemory({ sourceFamily: "project_file", automatedFileMaintenance: true }),
    true,
  );
});

test("事实统计和明细来自同一个一致性快照", async () => {
  const { database, db, owner, project, threadId } = await setup();
  try {
    const id = randomUUID();
    await query(
      db,
      "INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,created_by_type,created_by_id,task_type,title,goal,status) VALUES(?,?,?,'human_member','human_member',?,'formal','快照任务','目标','queued')",
      [id, project.id, threadId, owner.id],
    );
    let changed = false;
    const hook = {
      getConnection: async () => {
        const conn = await db.getConnection();
        return new Proxy(conn, {
          get(target, key) {
            if (key === "execute")
              return async (sql, params) => {
                const result = await target.execute(sql, params);
                if (!changed && sql.startsWith("SELECT id,name,description")) {
                  changed = true;
                  await query(db, "UPDATE agent_tasks SET status='completed' WHERE id=?", [id]);
                }
                return result;
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    };
    const facts = await readProjectFacts(hook, project.id, { kind: "task" });
    assert.equal(facts.counts.byStatus.queued, 1);
    assert.equal(facts.items[0].status, "queued");
    assert.equal(
      (await readProjectFacts(db, project.id, { kind: "task" })).counts.byStatus.completed,
      1,
    );
  } finally {
    await database.close();
  }
});

test("回答生成期间正文改变，引用仍指向实际读到的修订", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const pageId = await upsertMemoryPage(db, project.id, {
      subject: "project",
      title: "发布口令",
      body: "旧口令",
      createdBy: owner.id,
    });
    let usedRevisionId;
    const answer = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "发布口令" },
      {
        answer: async ({ pages }) => {
          const read = pages.find((item) => item.page.id === pageId);
          usedRevisionId = read.page.memoryRevisionId;
          await query(db, "UPDATE wiki_pages SET body='新口令' WHERE id=?", [pageId]);
          return "当时读到旧口令。";
        },
      },
    );
    assert.ok(usedRevisionId);
    assert.equal(
      answer.turn.answer.citations.find((c) => c.pageId === pageId).memoryRevisionId,
      usedRevisionId,
    );
    assert.equal((await readMemoryRevision(service, owner, usedRevisionId)).body, "旧口令");
  } finally {
    await database.close();
  }
});

test("任务决定固定声明采用的记忆和来源请求，错误引用与任务一起回滚", async () => {
  const { database, db, service, owner, project, threadId } = await setup();
  try {
    const source = await message(db, project.id, threadId, owner.id, "按周一安排发布任务");
    await settle(db, project.id, {
      statements: [
        {
          memberId: owner.id,
          subtype: "commitment",
          title: "发布安排",
          body: "A说按周一安排",
          sourceIds: [source],
        },
      ],
      discussions: [],
    });
    const found = await searchProjectMemory(db, project.id, { query: "发布安排" });
    const pin = found.entries[0];
    const input = {
      projectId: project.id,
      originThreadId: threadId,
      sourceType: "human_member",
      sourceUserId: owner.id,
      sourceMessageId: source,
      createdByType: "human_member",
      createdById: owner.id,
      taskType: "formal",
      title: "安排发布",
      goal: "执行发布安排",
      memoryRevisionIds: [pin.memoryRevisionId],
    };
    const task = await createTask(db, input);
    await query(db, "UPDATE messages SET body='现在改到周五' WHERE id=?", [source]);
    await supersedeMemoryEntry(service, owner, project.id, pin.pageId, { reason: "当前安排改变" });
    const [record] = await readTaskDecisionEvidence(db, project.id, task.id);
    assert.equal(record.basis.find((b) => b.kind === "message").body, "按周一安排发布任务");
    assert.equal(
      record.basis.find((b) => b.kind === "memory_page").memoryRevisionId,
      pin.memoryRevisionId,
    );
    assert.match((await readMemoryRevision(service, owner, pin.memoryRevisionId)).body, /周一/);
    const history = await callMcpTool(service, owner, "read_memory_history", {
      projectId: project.id,
      pageId: pin.pageId,
      limit: 1,
    });
    assert.equal(history.decisions[0].taskId, task.id);
    assert.ok(history.hasMore);
    assert.equal(
      (
        await callMcpTool(service, owner, "read_memory_revision", {
          revisionId: pin.memoryRevisionId,
        })
      ).id,
      pin.memoryRevisionId,
    );
    const facts = await callMcpTool(service, owner, "read_project_facts", {
      projectId: project.id,
      kind: "task",
    });
    assert.equal(facts.counts.tasks, 1);
    const other = await service.createProject(owner, { name: "其他项目" });
    const foreign = await upsertMemoryPage(db, other.id, {
      subject: "project",
      title: "其他项目事实",
      body: "不能跨项目引用",
      createdBy: owner.id,
    });
    const foreignPin = await getWikiPage(service, owner, other.id, foreign);
    await assert.rejects(
      createTask(db, {
        ...input,
        title: "不该创建",
        memoryRevisionIds: [foreignPin.page.memoryRevisionId],
      }),
      /跨项目/,
    );
    assert.equal(
      Number(
        (await query(db, "SELECT COUNT(*) n FROM agent_tasks WHERE project_id=?", [project.id]))[0]
          .n,
      ),
      1,
    );
  } finally {
    await database.close();
  }
});

test("未确认产物不替换正式内容，确认后的同一v1保留旧字节和确认出处", async () => {
  const { database, db, service, owner, project, threadId } = await setup();
  try {
    const [output] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_outputs' AND parent_id IS NULL",
      [project.id],
    );
    const artifactId = await createArtifact(db, {
      projectId: project.id,
      title: "发布产物",
      createdBy: owner.id,
      folderId: output.id,
    });
    const write = async (n, text) => {
      const id = randomUUID(),
        content = Buffer.from(text);
      await createVersion(db, {
        id,
        artifactId,
        version: n,
        threadId,
        filename: "release.txt",
        mime: "text/plain",
        content,
        sha256: createHash("sha256").update(content).digest("hex"),
        byteSize: content.length,
        note: "",
        createdBy: owner.id,
      });
      return id;
    };
    const v1 = await write(1, "周一发布");
    await service.review(owner, v1, { decision: "approved" });
    const official = await transaction(db, (conn) =>
      service.duplicateVersionToOfficial(conn, owner, project.id, v1, { skipOrganizeCheck: true }),
    );
    const oldIndex = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: official.artifactId,
      versionId: official.id,
      createdBy: owner.id,
    });
    const readBefore = await callMcpTool(service, owner, "read_document", {
      versionId: official.id,
    });
    assert.equal(readBefore.content, "周一发布");
    const v2 = await write(2, "周五发布");
    assert.equal(
      await transaction(db, (conn) =>
        service.updateLinkedOfficialFromSource(conn, owner, project.id, v2),
      ),
      null,
    );
    assert.equal((await service.version(owner, official.id)).content.toString(), "周一发布");
    const confirmation = await service.review(owner, v2, { decision: "approved" });
    assert.equal(
      (
        await query(db, "SELECT content FROM document_content_revisions WHERE id=?", [
          readBefore.contentRevisionId,
        ])
      )[0].content.toString(),
      "周一发布",
    );
    assert.equal((await service.version(owner, official.id)).content.toString(), "周五发布");
    const newIndex = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId: official.artifactId,
      versionId: official.id,
      createdBy: owner.id,
    });
    assert.notEqual(newIndex.pageId, oldIndex.pageId);
    const [event] = await query(
      db,
      "SELECT details FROM document_change_logs WHERE project_id=? AND action='official_updated_from_source' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(event.details.confirmationId, confirmation.id);
    assert.equal(event.details.sourceVersionId, v2);
    assert.ok(
      (
        await query(db, "SELECT content FROM document_content_revisions WHERE version_id=?", [
          official.id,
        ])
      ).some((r) => r.content.toString() === "周一发布"),
    );
    await query(
      db,
      "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3),purged_at=UTC_TIMESTAMP(3) WHERE id=?",
      [official.artifactId],
    );
    assert.equal(
      Number(
        (
          await query(db, "SELECT COUNT(*) n FROM document_content_revisions WHERE version_id=?", [
            official.id,
          ])
        )[0].n,
      ),
      0,
      "永久清除一并移除历史文件字节",
    );
  } finally {
    await database.close();
  }
});

test("嵌套记忆固定旧来源权限，心跳不产生事实事件，asOf不返回后来的正文", async () => {
  const { database, db, service, owner, project, threadId } = await setup();
  try {
    const source = await message(db, project.id, threadId, owner.id, "原始安排");
    const child = await upsertMemoryPage(db, project.id, {
      subject: "utterance",
      title: "原发言",
      body: "原始安排",
      createdBy: owner.id,
      sources: [{ kind: "message", id: source }],
    });
    const parent = await upsertMemoryPage(db, project.id, {
      subject: "discussion",
      title: "引用摘要",
      body: "根据原发言制定的安排",
      createdBy: owner.id,
      sources: [{ kind: "memory_page", id: child }],
    });
    const pinned = await getWikiPage(service, owner, project.id, parent);
    const [time] = await query(
      db,
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') atTime",
    );
    await query(
      db,
      "UPDATE memory_page_revisions SET recorded_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE page_id=?",
      [parent],
    );
    await query(db, "UPDATE wiki_pages SET body='后来的正文' WHERE id=?", [parent]);
    const historical = await searchProjectMemory(db, project.id, {
      query: "引用摘要",
      asOf: time.atTime,
      purpose: "history",
    });
    assert.ok(
      historical.entries.some((e) => e.pageId === parent && !e.excerpt.includes("后来的正文")),
    );
    await query(db, "DELETE FROM wiki_page_sources WHERE page_id=?", [child]);
    await query(db, "DELETE FROM messages WHERE id=?", [source]);
    await assert.rejects(
      readMemoryRevision(service, owner, pinned.page.memoryRevisionId),
      /不可访问/,
    );
    const before = Number(
      (
        await query(
          db,
          "SELECT COUNT(*) n FROM project_activity_history WHERE source_kind='thread' AND source_id=?",
          [threadId],
        )
      )[0].n,
    );
    await query(db, "UPDATE threads SET last_active_at=UTC_TIMESTAMP(3) WHERE id=?", [threadId]);
    assert.equal(
      Number(
        (
          await query(
            db,
            "SELECT COUNT(*) n FROM project_activity_history WHERE source_kind='thread' AND source_id=?",
            [threadId],
          )
        )[0].n,
      ),
      before,
    );
  } finally {
    await database.close();
  }
});
test("矛盾、改口、后续生气与人工停用均保留当时出处", async () => {
  const { database, db, service, owner, project, threadId } = await setup();
  try {
    const b = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      b.id,
      b.id + "@test.com",
      "B",
    ]);
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [
      project.id,
      b.id,
    ]);
    const monday = await message(db, project.id, threadId, owner.id, "发布会周一举行");
    const friday = await message(db, project.id, threadId, b.id, "发布会周五举行");
    await settle(db, project.id, {
      statements: [
        {
          memberId: owner.id,
          subtype: "commitment",
          title: "A的发布会安排",
          body: "A说发布会周一举行",
          sourceIds: [monday],
        },
        {
          memberId: b.id,
          subtype: "commitment",
          title: "B的发布会安排",
          body: "B说发布会周五举行",
          sourceIds: [friday],
        },
      ],
      discussions: [],
    });
    const initial = await searchProjectMemory(db, project.id, { query: "发布会", depth: 0 });
    assert.equal(initial.entries.length, 2);
    const old = initial.entries.find((e) => e.aboutUserId === owner.id);
    const pinned = await getWikiPage(service, owner, project.id, old.pageId);
    const correction = await message(
      db,
      project.id,
      threadId,
      owner.id,
      "更正我先前说的周一，发布会应该周五举行",
    );
    await settle(db, project.id, {
      statements: [
        {
          pageId: old.pageId,
          correctsPageId: old.pageId,
          memberId: owner.id,
          subtype: "commitment",
          title: "A更正发布会安排",
          body: "A更正为周五举行",
          sourceIds: [correction],
        },
      ],
      discussions: [],
    });
    const current = await searchProjectMemory(db, project.id, { query: "发布会", depth: 0 });
    assert.equal(current.entries.length, 3);
    assert.equal(current.entries.at(-1).pageId, old.pageId, "弱化排序而非自动作废或隐藏");
    const [original] = await query(db, "SELECT body,status FROM wiki_pages WHERE id=?", [
      old.pageId,
    ]);
    assert.equal(original.status, "current");
    assert.match(original.body, /周一/);
    const anger = await message(
      db,
      project.id,
      threadId,
      b.id,
      "我听了A说周一就安排了工作，现在发现搞错了，我很生气",
    );
    await settle(db, project.id, {
      statements: [
        {
          memberId: b.id,
          subtype: "risk_alert",
          title: "B说明生气原因",
          body: "B说听了A的周一安排后排了工作，因此生气",
          sourceIds: [anger],
        },
      ],
      discussions: [],
    });
    await assert.rejects(
      supersedeMemoryEntry(service, { ...owner, kind: "api" }, project.id, old.pageId, {
        reason: "AI认为错误",
      }),
      /人类/,
    );
    await query(db, "UPDATE messages SET body='编辑后的新说法' WHERE id=?", [monday]);
    assert.ok(
      (
        await searchProjectMemory(db, project.id, { purpose: "explain", query: "周一" })
      ).entries.some((e) => e.pageId === old.pageId),
    );
    await supersedeMemoryEntry(service, owner, project.id, old.pageId, {
      reason: "人工停止当前使用，保留历史",
    });
    const revision = await readMemoryRevision(service, owner, pinned.page.memoryRevisionId);
    assert.match(revision.body, /周一/);
    assert.equal(revision.status, "current");
    const history = await listMemoryHistory(service, owner, project.id, old.pageId);
    assert.ok(history.evidence.some((e) => e.evidence.body === "发布会周一举行"));
    assert.ok(
      (
        await searchProjectMemory(db, project.id, { purpose: "history", query: "周一" })
      ).entries.some((e) => e.pageId === old.pageId),
    );
    await assert.rejects(confirmMemoryEntry(), /无需确认/);
    await query(db, "UPDATE wiki_pages SET subject_type='task' WHERE id=?", [
      current.entries[0].pageId,
    ]);
    assert.equal(
      await resolveMemorySourceFamily(db, project.id, current.entries[0].pageId),
      "conversation",
    );
    await query(db, "DELETE FROM members WHERE project_id=? AND user_id=?", [project.id, b.id]);
    await assert.rejects(readMemoryRevision(service, b, pinned.page.memoryRevisionId));
  } finally {
    await database.close();
  }
});
test("业务当前状态按稳定ID覆盖，同名不合并，完整计数与历史独立", async () => {
  const { database, db, service, owner, project, threadId } = await setup();
  try {
    const ids = [];
    for (let i = 0; i < 205; i++) {
      const id = randomUUID();
      ids.push(id);
      await query(
        db,
        "INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,created_by_type,created_by_id,task_type,title,goal,status) VALUES(?,?,?,'human_member','human_member',?,'formal','同名任务','目标','queued')",
        [id, project.id, threadId, owner.id],
      );
    }
    const write = (id, title, body) =>
      upsertMemoryPage(db, project.id, {
        subject: "task",
        title,
        body,
        createdBy: owner.id,
        sources: [{ kind: "task", id }],
      });
    const first = await write(ids[0], "同名", "排队中");
    const second = await write(ids[1], "同名", "排队中");
    assert.notEqual(first, second);
    assert.equal(await write(ids[0], "改名后", "已完成"), first);
    await assert.rejects(
      supersedeMemoryEntry(service, owner, project.id, first, { reason: "停用" }),
      /不允许/,
    );
    await query(db, "UPDATE agent_tasks SET status='completed',revision=9 WHERE id=?", [ids[0]]);
    const stats = await loadTaskMemoryStats(db, project.id);
    assert.equal(stats.length, 205);
    assert.equal(stats.find((t) => t.id === ids[0]).reworked, false, "普通编辑次数不是返工");
    const facts = await readProjectFacts(db, project.id, { kind: "task", limit: 200 });
    assert.equal(facts.counts.tasks, 205);
    assert.equal(facts.items.length, 200);
    assert.equal(
      (await readProjectFacts(db, project.id, { kind: "task", offset: 200 })).items.length,
      5,
    );
    const events = await query(
      db,
      "SELECT action,facts FROM project_activity_history WHERE source_kind='task' AND source_id=? ORDER BY id",
      [ids[0]],
    );
    assert.equal(events[0].action, "created");
    assert.equal(events.at(-1).facts.status, "completed");
    const history = await listMemoryHistory(service, owner, project.id, first);
    assert.ok(history.revisions.some((r) => r.body === "排队中"));
    await assert.rejects(query(db, "UPDATE wiki_pages SET status='draft' WHERE id=?", [first]));
  } finally {
    await database.close();
  }
});
test("正式v1原地替换产生新索引，旧文件与记忆修订按当时内容读取", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const [root] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL",
      [project.id],
    );
    const artifactId = randomUUID(),
      versionId = randomUUID();
    await query(
      db,
      "INSERT INTO artifacts(id,project_id,title,created_by,folder_id) VALUES(?,?,'发布方案',?,?)",
      [artifactId, project.id, owner.id, root.id],
    );
    const content = Buffer.from("第一版：周一");
    await createVersion(db, {
      id: versionId,
      artifactId,
      version: 1,
      filename: "plan.txt",
      mime: "text/plain",
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      byteSize: content.length,
      note: "第一版",
      createdBy: owner.id,
    });
    const first = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId,
      versionId,
      createdBy: owner.id,
    });
    const pinned = await getWikiPage(service, owner, project.id, first.pageId);
    const replacement = Buffer.from("确认后的第二版：周五");
    await replaceVersionContent(db, {
      id: versionId,
      content: replacement,
      mime: "text/plain",
      sha256: createHash("sha256").update(replacement).digest("hex"),
      byteSize: replacement.length,
      note: "第二版",
      createdBy: owner.id,
    });
    const next = await syncDocumentMemory(db, {
      projectId: project.id,
      artifactId,
      versionId,
      createdBy: owner.id,
    });
    assert.notEqual(next.pageId, first.pageId);
    assert.equal(
      (await query(db, "SELECT status FROM wiki_pages WHERE id=?", [first.pageId]))[0].status,
      "superseded",
    );
    assert.match(
      (await readMemoryRevision(service, owner, pinned.page.memoryRevisionId)).body,
      /第一版/,
    );
    assert.ok(
      (
        await query(db, "SELECT content FROM document_content_revisions WHERE version_id=?", [
          versionId,
        ])
      ).some((row) => row.content.equals(content)),
    );
    assert.equal(
      (
        await syncDocumentMemory(db, {
          projectId: project.id,
          artifactId,
          versionId,
          createdBy: owner.id,
        })
      ).pageId,
      next.pageId,
    );
    await assert.rejects(
      supersedeMemoryEntry(service, owner, project.id, next.pageId, { reason: "人工停用" }),
      /不允许/,
    );
    const found = await callMcpTool(service, owner, "search_memory", {
      projectId: project.id,
      purpose: "history",
      query: "发布方案",
    });
    assert.ok(found.entries.some((entry) => entry.pageId === first.pageId));
    await query(db, "UPDATE artifacts SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?", [artifactId]);
    await assert.rejects(
      readMemoryRevision(service, owner, pinned.page.memoryRevisionId),
      /不可访问/,
    );
  } finally {
    await database.close();
  }
});
