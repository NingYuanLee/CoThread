import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  discussionTopicKey,
  linkDiscussionParticipants,
  syncThreadDiscussionMemory,
  upsertDiscussionMemory,
  discussionMemoryMarkdown,
} from "../server/discussion-memory.js";
import { updateMemoryJobSettings } from "../server/memory-jobs.js";
import { applyProjectMemoryResult } from "../server/project-memory.js";

async function setup() {
  const database = await testDatabase();
  const db = database.db;
  const service = new Service(db);
  const owner = { id: randomUUID(), kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    owner.id,
    owner.id + "@test.com",
    "负责人",
  ]);
  const project = await service.createProject(owner, { name: "讨论记忆项目" });
  return { database, db, owner, project };
}

async function insertMember(db, name) {
  const id = randomUUID();
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    id,
    id + "@test.com",
    name,
  ]);
  return id;
}

async function insertThread(db, projectId, userId) {
  const id = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    id,
    projectId,
    "讨论迭代",
    userId,
  ]);
  return id;
}

async function insertMessage(db, threadId, authorId, body = "发言") {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
    [id, threadId, authorId, body],
  );
  return id;
}

async function insertPage(
  db,
  projectId,
  userId,
  {
    subject = null,
    aboutUserId = null,
    kind = "status",
    title = "条目",
    body = "## 内容",
    status = "current",
  } = {},
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,about_user_id,kind,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [id, projectId, subject, aboutUserId, kind, title, body, status, userId, userId],
  );
  return id;
}

async function insertSource(db, pageId, kind, sourceId) {
  await query(
    db,
    "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
    [randomUUID(), pageId, kind, sourceId, "出处"],
  );
}

test("讨论记忆按消息出处关联参与者发言记忆，重复调用不重复建边", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const member = await insertMember(db, "成员甲");
    const thread = await insertThread(db, project.id, owner.id);
    const first = await insertMessage(db, thread, owner.id, "我主张先用关系网");
    const second = await insertMessage(db, thread, member, "我担心召回太慢");
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: owner.id,
      title: "负责人的发言",
    });
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: member,
      title: "成员甲的发言",
    });
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    await insertSource(db, discussion, "message", first);
    await insertSource(db, discussion, "message", second);

    const linked = await linkDiscussionParticipants(db, project.id, discussion, {
      createdBy: owner.id,
    });
    assert.equal(linked.linked, 2);
    let edges = await query(
      db,
      "SELECT relation FROM memory_relations WHERE project_id=? AND from_page_id=?",
      [project.id, discussion],
    );
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.relation === "relates"));

    await linkDiscussionParticipants(db, project.id, discussion, { createdBy: owner.id });
    edges = await query(
      db,
      "SELECT relation FROM memory_relations WHERE project_id=? AND from_page_id=?",
      [project.id, discussion],
    );
    assert.equal(edges.length, 2, "重复调用不应新增边");
  } finally {
    await database.close();
  }
});

test("同话题合并更新，出处去重", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const thread = await insertThread(db, project.id, owner.id);
    const message = await insertMessage(db, thread, owner.id);
    const first = await upsertDiscussionMemory(db, project.id, {
      title: "是否引入向量检索",
      body: "## 议题\n先讨论",
      sources: [{ kind: "message", id: message, label: "群聊消息" }],
      createdBy: owner.id,
    });
    assert.equal(first.created, true);
    const second = await upsertDiscussionMemory(db, project.id, {
      title: "是否引入 向量检索？",
      body: "## 依据\n成本偏高",
      sources: [{ kind: "message", id: message, label: "群聊消息" }],
      createdBy: owner.id,
    });
    assert.equal(second.created, false);
    assert.equal(second.pageId, first.pageId);
    const pages = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND subject_type='discussion'",
      [project.id],
    );
    assert.equal(pages.length, 1);
    assert.ok(pages[0].body.includes("## 更新"));
    assert.ok(pages[0].body.includes("成本偏高"));
    const sources = await query(db, "SELECT id FROM wiki_page_sources WHERE page_id=?", [
      first.pageId,
    ]);
    assert.equal(sources.length, 1);
    assert.equal(discussionTopicKey("是否引入 向量检索？"), discussionTopicKey("是否引入向量检索"));
    assert.ok(discussionMemoryMarkdown({ topic: "向量检索" }).includes("## 参与者与观点"));
  } finally {
    await database.close();
  }
});

test("结算写讨论记忆时自动连参与者的发言记忆", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const member = await insertMember(db, "成员乙");
    const thread = await insertThread(db, project.id, owner.id);
    const first = await insertMessage(db, thread, owner.id, "支持先做记忆");
    const second = await insertMessage(db, thread, member, "反对先做检索");
    const queueFirst = randomUUID();
    const queueSecond = randomUUID();
    for (const [queueId, messageId] of [
      [queueFirst, first],
      [queueSecond, second],
    ])
      await query(
        db,
        "INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint) VALUES(?,?,'message',?,'群聊消息')",
        [queueId, project.id, messageId],
      );
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: owner.id,
      title: "负责人的发言",
    });
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: member,
      title: "成员乙的发言",
    });

    const applied = await applyProjectMemoryResult(
      db,
      project.id,
      {
        entries: [
          {
            op: "create",
            subject: "discussion",
            kind: "status",
            title: "先做记忆还是先做检索",
            body: "## 议题\n先做记忆",
            sourceIds: [queueFirst, queueSecond],
          },
        ],
      },
      {
        userId: owner.id,
        candidates: [
          { queueId: queueFirst, sourceKind: "message", sourceId: first },
          { queueId: queueSecond, sourceKind: "message", sourceId: second },
        ],
      },
    );
    assert.equal(applied.created.length, 1);
    const edges = await query(
      db,
      "SELECT relation FROM memory_relations WHERE project_id=? AND from_page_id=?",
      [project.id, applied.created[0]],
    );
    assert.equal(edges.length, 2, "两个参与者各一条关联");
  } finally {
    await database.close();
  }
});

test("宽窗口：整迭代讨论沉淀为一条讨论记忆，连参与者并继承到整体", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const member = await insertMember(db, "成员丙");
    const thread = await insertThread(db, project.id, owner.id);
    const first = await insertMessage(db, thread, owner.id, "我主张先做记忆");
    const second = await insertMessage(db, thread, member, "我担心召回精度");
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: owner.id,
      title: "负责人的发言",
    });
    await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: member,
      title: "成员丙的发言",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "项目整体",
    });

    const result = await syncThreadDiscussionMemory(db, {
      projectId: project.id,
      threadId: thread,
      createdBy: owner.id,
    });
    assert.ok(result?.pageId);
    const [page] = await query(
      db,
      "SELECT title,body,subject_type subjectType FROM wiki_pages WHERE id=?",
      [result.pageId],
    );
    assert.equal(page.subjectType, "discussion");
    assert.match(page.title, /^讨论：/);
    assert.match(page.body, /负责人/);
    assert.match(page.body, /成员丙/);
    assert.match(page.body, /## 已达成/);
    const sources = await query(
      db,
      "SELECT source_kind sourceKind,source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [result.pageId],
    );
    assert.equal(sources.length, 3, "迭代 + 两条消息");
    assert.ok(sources.some((source) => source.sourceKind === "thread"));
    const edges = await query(
      db,
      "SELECT relation,to_page_id toPageId FROM memory_relations WHERE project_id=? AND from_page_id=?",
      [project.id, result.pageId],
    );
    assert.equal(edges.filter((edge) => edge.relation === "relates").length, 2);
    const derives = edges.find((edge) => edge.relation === "derives");
    assert.equal(derives.toPageId, overall);

    const again = await syncThreadDiscussionMemory(db, {
      projectId: project.id,
      threadId: thread,
      createdBy: owner.id,
    });
    assert.equal(again.pageId, result.pageId, "同一迭代不重复建条");
    const pages = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='discussion'",
      [project.id],
    );
    assert.equal(pages.length, 1);
    assert.ok(first && second);

    await updateMemoryJobSettings(
      db,
      project.id,
      "discussion_memory",
      { enabled: false },
      owner.id,
    );
    const disabled = await syncThreadDiscussionMemory(db, {
      projectId: project.id,
      threadId: thread,
      createdBy: owner.id,
    });
    assert.equal(disabled.skipped, true);
  } finally {
    await database.close();
  }
});
