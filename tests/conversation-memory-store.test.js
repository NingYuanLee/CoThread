import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod/v3";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { testDatabase } from "./database.js";
import { loadConversationContext } from "../server/conversation-memory-context.ts";
import {
  processConversationWindow,
  processNextConversationMemory,
} from "../server/conversation-memory-runner.js";
import { processNextProjectMemory } from "../server/project-memory.js";
import { searchProjectMemory } from "../server/memory-search.js";
import { readProjectMemory } from "../server/memory-timeline.js";
import { readMemberUnderstanding } from "../server/memory-cache.ts";
import { startConversationToolBridge } from "../server/conversation-memory-tools.js";
import { runLaowengTask } from "../server/laoweng-agent.js";
import {
  queueConversationMessage,
  createConversationWindow,
  saveConversationCandidates,
  applyConversationCandidate,
  failConversationCandidate,
  queueConversationThread,
  queueConversationRecheck,
} from "../server/conversation-memory-store.js";

test("消息窗口分批、保留新消息并持久化零产出", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "窗口测试" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const sequences = [];
    const messageIds = [];
    for (let i = 0; i < 3; i++) {
      const messageId = randomUUID();
      messageIds.push(messageId);
      const result = await query(
        db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
        [messageId, threadId, owner.id, `消息 ${i}`],
      );
      sequences.push(String(result.insertId));
      await queueConversationMessage(db, project.id, threadId, String(result.insertId));
    }
    assert.equal(
      await createConversationWindow(db, { projectId: project.id }),
      null,
      "未到静默时间不处理",
    );
    await query(
      db,
      "UPDATE conversation_memory_queue SET first_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 61 MINUTE),last_at=UTC_TIMESTAMP(3) WHERE thread_id=?",
      [threadId],
    );
    const first = await createConversationWindow(db, {
      projectId: project.id,
      limit: 2,
    });
    assert.ok(first, "持续有新消息也须在最长等待后触发");
    assert.equal(first.firstSequence, sequences[0]);
    assert.equal(first.lastSequence, sequences[1]);
    assert.equal(
      await createConversationWindow(db, { projectId: project.id, force: true }),
      null,
      "前一窗口未完成时同一讨论不越序处理",
    );
    assert.equal(
      await saveConversationCandidates(db, first.id, { statements: [], discussions: [] }),
      true,
    );
    assert.equal(
      await saveConversationCandidates(db, first.id, { statements: [], discussions: [] }),
      false,
    );
    const [completed] = await query(
      db,
      "SELECT response_saved,statement_status,discussion_status FROM conversation_memory_windows WHERE id=?",
      [first.id],
    );
    assert.equal(Number(completed.response_saved), 1);
    assert.equal(completed.statement_status, "completed");
    assert.equal(completed.discussion_status, "completed");
    const second = await createConversationWindow(db, { projectId: project.id, force: true });
    assert.equal(second.lastSequence, sequences[2]);
    assert.equal(BigInt(second.firstSequence), BigInt(sequences[1]) + 1n);
    await saveConversationCandidates(db, second.id, {
      statements: [
        {
          memberId: owner.id,
          subtype: "commitment",
          title: "承诺",
          body: "消息 2",
          sourceIds: [messageIds[2]],
        },
      ],
      discussions: [],
    });
    const [candidate] = await query(
      db,
      "SELECT id FROM conversation_memory_candidates WHERE window_id=?",
      [second.id],
    );
    await assert.rejects(
      applyConversationCandidate(db, candidate.id, {
        actorId: owner.id,
        verifySupport: async () => false,
      }),
      /未通过出处核验/,
    );
    assert.equal(await failConversationCandidate(db, candidate.id, "证据不足", 60), true);
    const [failed] = await query(
      db,
      "SELECT statement_status,discussion_status,attempts FROM conversation_memory_windows WHERE id=?",
      [second.id],
    );
    assert.equal(failed.statement_status, "failed");
    assert.equal(failed.discussion_status, "completed");
    assert.equal(failed.attempts, 1);
    const applied = await applyConversationCandidate(db, candidate.id, {
      actorId: owner.id,
      verifySupport: async ({ messages }) => messages[0].body === "消息 2",
    });
    assert.equal(applied.alreadyApplied, false);
    const repeated = await applyConversationCandidate(db, candidate.id, {
      actorId: owner.id,
      verifySupport: async () => {
        throw new Error("不应重复核验");
      },
    });
    assert.equal(repeated.alreadyApplied, true);
    const [page] = await query(
      db,
      "SELECT subject_type subjectType,about_user_id memberId FROM wiki_pages WHERE id=?",
      [applied.pageId],
    );
    assert.equal(page.subjectType, "utterance");
    assert.equal(page.memberId, owner.id);
    const [source] = await query(
      db,
      "SELECT source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [applied.pageId],
    );
    assert.equal(source.sourceId, messageIds[2]);
    const [done] = await query(
      db,
      "SELECT statement_status,discussion_status FROM conversation_memory_windows WHERE id=?",
      [second.id],
    );
    assert.equal(done.statement_status, "completed");
    assert.equal(done.discussion_status, "completed");
    assert.equal(await failConversationCandidate(db, candidate.id, "已完成不应再失败"), false);
    const messageId = randomUUID();
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [messageId, threadId, owner.id, "承诺变更"],
    );
    await queueConversationMessage(db, project.id, threadId, inserted.insertId);
    const third = await createConversationWindow(db, { projectId: project.id, force: true });
    const context = await loadConversationContext(db, third.id);
    assert.equal(context.messages[0].id, messageId);
    assert.equal(context.background.length, 3);
    const otherProject = await new Service(db).createProject(owner, { name: "另一个项目" });
    const otherThread = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      otherThread,
      otherProject.id,
      "其他",
      owner.id,
    ]);
    const otherMessage = randomUUID();
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [otherMessage, otherThread, owner.id, "另一个项目的私有消息"],
    );
    const bridge = await startConversationToolBridge(db, context);
    try {
      const call = async (message, token = bridge.env.COTHREAD_BRIDGE_TOKEN) =>
        fetch(`${bridge.env.COTHREAD_BRIDGE_URL}/tool`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "read_message", args: { messageId: message } }),
        });
      assert.equal((await call(messageId, "wrong")).status, 403);
      const allowed = await call(messageId);
      assert.equal(allowed.status, 200);
      assert.equal(JSON.parse(await allowed.json()).id, messageId);
      const longMessage = randomUUID();
      await query(
        db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
        [longMessage, threadId, owner.id, "甲".repeat(6500)],
      );
      const firstPart = JSON.parse(await (await call(longMessage)).json());
      assert.equal(firstPart.text.length, 6000);
      assert.equal(firstPart.nextOffset, 6000);
      const next = await fetch(`${bridge.env.COTHREAD_BRIDGE_URL}/tool`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridge.env.COTHREAD_BRIDGE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "read_message",
          args: { messageId: longMessage, offset: firstPart.nextOffset },
        }),
      });
      assert.equal(JSON.parse(await next.json()).text.length, 500);
      assert.equal(
        (await call(otherMessage)).status,
        400,
        "即使同一用户是两个项目的成员，也不能跨项目读取",
      );
    } finally {
      await bridge.close();
    }
    const pages = await query(
      db,
      "SELECT id,title,body,status,subject_type subjectType,about_user_id aboutUserId,memory_subtype subtype FROM wiki_pages WHERE id=?",
      [applied.pageId],
    );
    await saveConversationCandidates(
      db,
      third.id,
      {
        statements: [
          {
            pageId: applied.pageId,
            memberId: owner.id,
            subtype: "commitment",
            title: "更新承诺",
            body: "承诺变更",
            sourceIds: [messageId],
          },
        ],
        discussions: [],
      },
      { pages },
    );
    const [update] = await query(
      db,
      "SELECT id FROM conversation_memory_candidates WHERE window_id=?",
      [third.id],
    );
    await query(db, "UPDATE wiki_pages SET body=? WHERE id=?", ["人工修改", applied.pageId]);
    await assert.rejects(
      applyConversationCandidate(db, update.id, {
        actorId: owner.id,
        verifySupport: async () => true,
      }),
      /更新目标已变化/,
    );
    const [preserved] = await query(db, "SELECT body FROM wiki_pages WHERE id=?", [applied.pageId]);
    assert.equal(preserved.body, "人工修改");
    await query(db, "UPDATE messages SET body=? WHERE id=?", ["发言已修改", messageId]);
    await assert.rejects(loadConversationContext(db, third.id), /已被修改或删除/);
  } finally {
    await database.close();
  }
});

test("真实发消息后由成员作业调度联合窗口", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const service = new Service(db);
    const project = await service.createProject(owner, { name: "联合作业调度" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const message = await service.insertMessage(db, owner, threadId, "需要讨论这个问题");
    const [queued] = await query(
      db,
      "SELECT thread_id threadId FROM conversation_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(queued.threadId, threadId);
    const [legacy] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=? AND source_kind='message'",
      [project.id],
    );
    assert.equal(Number(legacy.count), 0);
    const options = {
      projectId: project.id,
      task: "member_memory",
      analyze: async () => ({
        statements: [],
        discussions: [
          {
            subtype: "requirements",
            title: "讨论这个问题",
            body: "尚未讨论",
            stage: "pending",
            sourceIds: [message.id],
          },
        ],
      }),
      verifySupport: async () => true,
    };
    assert.equal(await processNextProjectMemory(db, options), false);
    await query(
      db,
      "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 11 MINUTE) WHERE thread_id=?",
      [threadId],
    );
    assert.equal(await processNextProjectMemory(db, options), true);
    const [page] = await query(
      db,
      "SELECT id,title FROM wiki_pages WHERE project_id=? AND subject_type='discussion' AND status='current'",
      [project.id],
    );
    assert.equal(page.title, "讨论这个问题");
    const [signal] = await query(
      db,
      "SELECT source_id sourceId FROM agent_project_memory_queue WHERE project_id=? AND source_kind='memory_page' AND source_id=?",
      [project.id, page.id],
    );
    assert.equal(
      signal,
      undefined,
      "核心议题页由联合分析处理，不再入项目进程队列（见 13-laoweng-workloads 5.1）",
    );
    const [run] = await query(
      db,
      "SELECT status,had_updates FROM agent_laoweng_runs WHERE project_id=? AND task='member_memory' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(run.status, "completed");
    assert.equal(Number(run.had_updates), 1);
    const backfill = await queueConversationThread(db, project.id, threadId, { backfill: true });
    assert.equal(backfill.queued, false, "历史回填不会重复分析已处理消息");
    const [queueCount] = await query(
      db,
      "SELECT COUNT(*) count FROM conversation_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(queueCount.count), 0);
  } finally {
    await database.close();
  }
});

test("切换迁移保留旧待处理发言并把队列合并到迭代", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "迁移测试" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const first = randomUUID();
    const one = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','观点一','[]')",
      [first, threadId, owner.id],
    );
    const second = randomUUID();
    const two = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','观点二','[]')",
      [second, threadId, owner.id],
    );
    const missing = randomUUID();
    await query(
      db,
      "INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint) VALUES(?,?,'message',?,'观点一'),(?,?,'message',?,'原文缺失')",
      [randomUUID(), project.id, first, randomUUID(), project.id, missing],
    );
    await query(
      db,
      "INSERT INTO agent_member_memory_queue(project_id,user_id,pending_through_sequence,available_at) VALUES(?,?,?,UTC_TIMESTAMP(3))",
      [project.id, owner.id, two.insertId],
    );
    const sql = await readFile(
      new URL("../migrations/156_conversation_memory_cutover.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean))
      await query(db, statement);
    const [queue] = await query(
      db,
      "SELECT first_sequence firstSequence,last_sequence lastSequence FROM conversation_memory_queue WHERE thread_id=?",
      [threadId],
    );
    assert.equal(String(queue.firstSequence), String(one.insertId));
    assert.equal(String(queue.lastSequence), String(two.insertId));
    const remaining = await query(
      db,
      "SELECT source_id sourceId FROM agent_project_memory_queue WHERE project_id=? AND source_kind='message'",
      [project.id],
    );
    assert.deepEqual(
      remaining.map((row) => row.sourceId),
      [missing],
    );
    const [members] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_member_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(members.count), 0);
  } finally {
    await database.close();
  }
});

test("排队后删除消息不会把窗口误判为已处理", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "消息删除保底" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const deletedId = randomUUID();
    const first = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','原始消息','[]')",
      [deletedId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, first.insertId);
    const secondId = randomUUID();
    const second = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','保留消息','[]')",
      [secondId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, second.insertId);
    await query(db, "DELETE FROM messages WHERE id=?", [deletedId]);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    await assert.rejects(loadConversationContext(db, window.id), /修改或删除/);
    const outcome = await processConversationWindow(db, window.id, {
      analyze: async () => {
        throw new Error("不应调用模型");
      },
    });
    assert.equal(outcome.failed, 1);
    const [row] = await query(
      db,
      "SELECT statement_status,discussion_status,error FROM conversation_memory_windows WHERE id=?",
      [window.id],
    );
    assert.equal(row.statement_status, "failed");
    assert.equal(row.discussion_status, "failed");
    assert.match(row.error, /修改或删除/);
    assert.equal(outcome.invalidated, true);
    assert.ok(outcome.replacementId);
    const fresh = await processConversationWindow(db, outcome.replacementId, {
      analyze: async (context) => {
        assert.deepEqual(
          context.messages.map((message) => message.id),
          [secondId],
        );
        return { statements: [], discussions: [] };
      },
    });
    assert.equal(fresh.failed, 0);
    const nextMessage = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','删除后的新消息','[]')",
      [randomUUID(), threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, nextMessage.insertId);
    assert.ok(await createConversationWindow(db, { projectId: project.id, force: true }));
  } finally {
    await database.close();
  }
});

test("正常零产出推进两类进度并记录尝试时间", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "零产出" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [randomUUID(), threadId, owner.id, "收到，谢谢"],
    );
    await queueConversationMessage(db, project.id, threadId, inserted.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const outcome = await processConversationWindow(db, window.id, {
      analyze: async () => ({ statements: [], discussions: [] }),
    });
    assert.deepEqual([outcome.applied, outcome.failed], [0, 0]);
    const [row] = await query(
      db,
      "SELECT statement_status statementStatus,discussion_status discussionStatus,last_attempt_at lastAttemptAt FROM conversation_memory_windows WHERE id=?",
      [window.id],
    );
    assert.deepEqual([row.statementStatus, row.discussionStatus], ["completed", "completed"]);
    assert.ok(row.lastAttemptAt);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM conversation_memory_candidates WHERE window_id=?",
      [window.id],
    );
    assert.equal(Number(count.count), 0);
  } finally {
    await database.close();
  }
});

test("窗口批量上限不能通过参数绕过", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "批量上限" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    for (let i = 0; i < 41; i++) {
      const inserted = await query(
        db,
        "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
        [randomUUID(), threadId, owner.id, `消息 ${i}`],
      );
      await queueConversationMessage(db, project.id, threadId, inserted.insertId);
    }
    const window = await createConversationWindow(db, {
      projectId: project.id,
      force: true,
      limit: 100,
    });
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM conversation_window_messages WHERE window_id=?",
      [window.id],
    );
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM conversation_pending_messages WHERE thread_id=?",
      [threadId],
    );
    assert.equal(Number(count.count), 40);
    assert.equal(Number(pending.count), 1);
  } finally {
    await database.close();
  }
});

test("超长单条消息仍能完整核验并保存候选", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "超长消息" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const body = "x".repeat(30001) + "重要问题在末尾";
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [messageId, threadId, owner.id, body],
    );
    await queueConversationMessage(db, project.id, threadId, inserted.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const outcome = await processConversationWindow(db, window.id, {
      analyze: async (context) => {
        assert.ok(context.messages.some((message) => message.body === body));
        return {
          statements: [],
          discussions: [
            {
              subtype: "requirements",
              title: "重要问题",
              body: "重要问题在末尾",
              stage: "pending",
              sourceIds: [messageId],
            },
          ],
        };
      },
      verifySupport: async ({ messages }) => {
        assert.equal(messages[0].body, body);
        return true;
      },
    });
    assert.deepEqual([outcome.applied, outcome.failed], [1, 0]);
    const [attempt] = await query(
      db,
      "SELECT last_attempt_at lastAttemptAt FROM conversation_memory_windows WHERE id=?",
      [window.id],
    );
    assert.ok(attempt.lastAttemptAt, "成功处理也记录最近尝试时间");
  } finally {
    await database.close();
  }
});

test("联合处理分别保存有效产物并保留失败项，重试不重复生成", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "联合分析测试" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const inserted = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
      [messageId, threadId, owner.id, "问题是否应该优先解决？"],
    );
    await queueConversationMessage(db, project.id, threadId, inserted.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    let analyses = 0;
    const options = {
      analyze: async () => {
        analyses++;
        return {
          statements: [
            {
              memberId: owner.id,
              subtype: "key_judgment",
              title: "需要优先解决",
              body: "提出优先处理问题",
              sourceIds: [messageId],
            },
          ],
          discussions: [
            {
              subtype: "requirements",
              title: "是否优先解决",
              body: "待讨论",
              stage: "pending",
              sourceIds: [messageId],
            },
          ],
        };
      },
      verifySupport: async ({ kind }) => kind === "statement",
    };
    const first = await processConversationWindow(db, window.id, options);
    assert.deepEqual([first.applied, first.failed], [1, 1]);
    let [status] = await query(
      db,
      "SELECT statement_status,discussion_status FROM conversation_memory_windows WHERE id=?",
      [window.id],
    );
    assert.equal(status.statement_status, "completed");
    assert.equal(status.discussion_status, "failed");
    const second = await processConversationWindow(db, window.id, {
      ...options,
      verifySupport: async () => true,
    });
    assert.deepEqual([second.applied, second.failed], [1, 0]);
    assert.equal(analyses, 1);
    [status] = await query(
      db,
      "SELECT statement_status,discussion_status FROM conversation_memory_windows WHERE id=?",
      [window.id],
    );
    assert.equal(status.discussion_status, "completed");
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type IN ('utterance','discussion')",
      [project.id],
    );
    assert.equal(Number(count.count), 2);
    const [relation] = await query(
      db,
      "SELECT COUNT(*) count FROM memory_relations WHERE project_id=? AND relation='relates'",
      [project.id],
    );
    assert.equal(Number(relation.count), 1, "共同消息出处关联两类记忆");
    const [discussion] = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND subject_type='discussion'",
      [project.id],
    );
    assert.match(discussion.body, /待讨论 \/ 未形成结论/);
    await query(db, "UPDATE messages SET body='内容已更改' WHERE id=?", [messageId]);
    const search = await searchProjectMemory(db, project.id, { depth: 0 });
    assert.equal(
      search.entries.filter((entry) => ["utterance", "discussion"].includes(entry.subject)).length,
      2,
    );
    assert.ok(await readMemberUnderstanding(db, project.id, owner.id));
    const timeline = await readProjectMemory(new Service(db), owner, project.id);
    assert.equal(timeline.entries.filter((entry) => entry.sourceNeedsReview).length, 2);
    const staleDiscussion = timeline.entries.find((entry) => entry.subject === "discussion");
    assert.ok(staleDiscussion);
    assert.equal(
      (await queueConversationRecheck(db, project.id, staleDiscussion.id, owner.id)).queued,
      1,
    );
    const recheck = await createConversationWindow(db, { projectId: project.id, force: true });
    const repaired = await processConversationWindow(db, recheck.id, {
      analyze: async (context) => {
        assert.ok(context.stalePages.some((page) => page.id === staleDiscussion.id));
        return {
          statements: [],
          discussions: [
            {
              pageId: staleDiscussion.id,
              subtype: "requirements",
              title: "是否优先解决",
              body: "内容已更改",
              stage: "pending",
              sourceIds: [messageId],
            },
          ],
        };
      },
      verifySupport: async () => true,
    });
    assert.equal(repaired.failed, 0);
    const refreshed = await searchProjectMemory(db, project.id, { depth: 0 });
    assert.ok(refreshed.entries.some((entry) => entry.pageId === staleDiscussion.id));
    const [after] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type IN ('utterance','discussion')",
      [project.id],
    );
    assert.equal(Number(after.count), 2, "重核更新原页而不创建重复记忆");
  } finally {
    await database.close();
  }
});

test("待观察问题到期先复核，提升议题后才标为解决", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "观察复核" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const backgroundId = randomUUID();
    await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','缓存是否必要？','[]')",
      [backgroundId, threadId, owner.id],
    );
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','是否需要额外缓存？','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const first = await processConversationWindow(db, window.id, {
      analyze: async () => ({
        statements: [],
        discussions: [],
        observations: [{ question: "是否需要额外缓存？", sourceIds: [backgroundId] }],
      }),
      verifySupport: async () => true,
    });
    assert.equal(first.failed, 0);
    let [observation] = await query(
      db,
      "SELECT id,status FROM conversation_memory_observations WHERE project_id=?",
      [project.id],
    );
    assert.equal(observation.status, "pending");
    const [before] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type='discussion'",
      [project.id],
    );
    assert.equal(Number(before.count), 0);
    await query(
      db,
      "UPDATE conversation_memory_observations SET review_after=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
      [observation.id],
    );
    assert.equal(
      await processNextConversationMemory(db, {
        projectId: project.id,
        reviewObservation: async () => ({
          decision: "promote",
          reason: "需要持续讨论",
          discussion: {
            subtype: "technical_decision",
            title: "是否需要额外缓存",
            body: "尚无结论",
            stage: "pending",
            sourceIds: [messageId],
          },
        }),
      }),
      true,
    );
    [observation] = await query(
      db,
      "SELECT id,status FROM conversation_memory_observations WHERE id=?",
      [observation.id],
    );
    assert.equal(observation.status, "promoting");
    const raced = await processConversationWindow(db, window.id, {
      verifySupport: async () => {
        await query(db, "UPDATE messages SET body='背景已修改' WHERE id=?", [backgroundId]);
        return true;
      },
    });
    assert.equal(raced.failed, 1, "复核后背景出处变化时不能写入议题");
    const [stillPending] = await query(
      db,
      "SELECT status FROM conversation_memory_observations WHERE id=?",
      [observation.id],
    );
    assert.equal(stillPending.status, "promoting");
    await query(db, "UPDATE messages SET body='缓存是否必要？' WHERE id=?", [backgroundId]);
    const second = await processConversationWindow(db, window.id, {
      verifySupport: async () => true,
    });
    assert.equal(second.failed, 0);
    const [done] = await query(
      db,
      "SELECT status,promoted_page_id pageId FROM conversation_memory_observations WHERE project_id=?",
      [project.id],
    );
    assert.equal(done.status, "resolved");
    const [page] = await query(db, "SELECT body FROM wiki_pages WHERE id=? AND status='current'", [
      done.pageId,
    ]);
    assert.match(page.body, /待讨论/);
  } finally {
    await database.close();
  }
});

test("观察出处发生变化时到期复核保留问题并记录原因", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "复核失败保底" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','是否需要缓存？','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    await processConversationWindow(db, window.id, {
      analyze: async () => ({
        statements: [],
        discussions: [],
        observations: [{ question: "是否需要缓存？", sourceIds: [messageId] }],
      }),
      verifySupport: async () => true,
    });
    await query(db, "UPDATE messages SET body='已更改' WHERE id=?", [messageId]);
    await query(
      db,
      "UPDATE conversation_memory_observations SET review_after=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE project_id=?",
      [project.id],
    );
    let called = false;
    assert.equal(
      await processNextConversationMemory(db, {
        projectId: project.id,
        reviewObservation: async () => {
          called = true;
          return { decision: "dismiss", reason: "不再需要" };
        },
      }),
      true,
    );
    assert.equal(called, false);
    const [row] = await query(
      db,
      "SELECT status,review_note note,review_attempts attempts FROM conversation_memory_observations WHERE project_id=?",
      [project.id],
    );
    assert.equal(row.status, "pending");
    assert.match(row.note, /修改或删除/);
    assert.equal(row.attempts, 1);
  } finally {
    await database.close();
  }
});

test("已复核关闭的观察问题到期清理并保留审计", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "观察清理" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','这次需要通知吗？','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    await processConversationWindow(db, window.id, {
      analyze: async () => ({
        statements: [],
        discussions: [],
        observations: [{ question: "这次需要通知吗？", sourceIds: [messageId] }],
      }),
      verifySupport: async () => true,
    });
    await query(
      db,
      "UPDATE conversation_memory_observations SET review_after=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE project_id=?",
      [project.id],
    );
    await processNextConversationMemory(db, {
      projectId: project.id,
      reviewObservation: async () => ({ decision: "dismiss", reason: "只涉及当次通知" }),
    });
    const [dismissed] = await query(
      db,
      "SELECT id,status FROM conversation_memory_observations WHERE project_id=?",
      [project.id],
    );
    assert.equal(dismissed.status, "dismissed");
    await query(
      db,
      "UPDATE conversation_memory_observations SET last_review_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 31 DAY) WHERE id=?",
      [dismissed.id],
    );
    assert.equal(await processNextConversationMemory(db, { projectId: project.id }), true);
    const [remaining] = await query(
      db,
      "SELECT COUNT(*) count FROM conversation_memory_observations WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(remaining.count), 0);
    const [audit] = await query(
      db,
      "SELECT details FROM project_change_logs WHERE project_id=? AND action='conversation_observation_cleaned'",
      [project.id],
    );
    assert.ok(audit);
  } finally {
    await database.close();
  }
});

test("失败候选可单独重分析，成功产物不会重复创建", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "候选恢复" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','我负责接口','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const first = await processConversationWindow(db, window.id, {
      analyze: async () => ({
        statements: [
          { memberId: owner.id, title: "接口分工", body: "负责接口", sourceIds: [messageId] },
        ],
        discussions: [
          {
            subtype: "requirements",
            title: "接口分工",
            body: "讨论接口分工",
            stage: "pending",
            sourceIds: [messageId],
          },
        ],
      }),
      verifySupport: async () => true,
    });
    assert.deepEqual([first.applied, first.failed], [1, 1]);
    const second = await processConversationWindow(db, window.id, {
      verifySupport: async () => true,
      repairCandidate: async () => ({
        memberId: owner.id,
        subtype: "commitment",
        title: "接口分工",
        body: "负责接口",
        sourceIds: [messageId],
      }),
    });
    assert.deepEqual([second.applied, second.failed], [1, 0]);
    const [repairs] = await query(db, "SELECT COUNT(*) count FROM conversation_candidate_repairs");
    assert.equal(Number(repairs.count), 1);
    const [pages] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type IN ('utterance','discussion')",
      [project.id],
    );
    assert.equal(Number(pages.count), 2);
  } finally {
    await database.close();
  }
});

test("同名同出处的重复候选不能创建第二页", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "重复候选" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','我负责接口','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const item = {
      memberId: owner.id,
      subtype: "commitment",
      title: "接口分工",
      body: "负责接口",
      sourceIds: [messageId],
    };
    const first = await processConversationWindow(db, window.id, {
      analyze: async () => ({ statements: [item, item], discussions: [] }),
      verifySupport: async () => true,
    });
    assert.deepEqual([first.applied, first.failed], [1, 1]);
    const [page] = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='utterance'",
      [project.id],
    );
    const second = await processConversationWindow(db, window.id, {
      verifySupport: async () => true,
      repairCandidate: async () => ({ ...item, pageId: page.id }),
    });
    assert.equal(second.failed, 0);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND subject_type='utterance'",
      [project.id],
    );
    assert.equal(Number(count.count), 1);
  } finally {
    await database.close();
  }
});

test("联合分析会话仅注入项目只读工具桥", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const owner = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      owner.id,
      owner.id + "@test.com",
      "负责人",
    ]);
    const project = await new Service(db).createProject(owner, { name: "只读工具会话" });
    const threadId = randomUUID();
    await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
      threadId,
      project.id,
      "测试",
      owner.id,
    ]);
    const messageId = randomUUID();
    const message = await query(
      db,
      "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','测试来源','[]')",
      [messageId, threadId, owner.id],
    );
    await queueConversationMessage(db, project.id, threadId, message.insertId);
    const window = await createConversationWindow(db, { projectId: project.id, force: true });
    const bridge = await startConversationToolBridge(
      db,
      await loadConversationContext(db, window.id),
    );
    try {
      const result = await runLaowengTask(
        db,
        project.id,
        "member_memory",
        {},
        z.object({ ok: z.boolean() }),
        {
          conversationToolEnv: bridge.env,
          model: {
            baseUrl: "http://127.0.0.1:1/v1",
            apiKey: "test",
            model: "test",
            reasoningEffort: "medium",
          },
          createHarness: (config) => ({
            async start() {
              assert.match(await readFile(config.patches.at(-1), "utf8"), /elder-ask-tools/);
              const allowed = JSON.parse(config.env.COTHREAD_ALLOWED_TOOLS);
              assert.ok(allowed.includes("read_message"));
              assert.ok(!allowed.includes("post_message"));
            },
            async run() {
              const response = await fetch(`${config.env.COTHREAD_BRIDGE_URL}/tool`, {
                method: "POST",
                headers: { Authorization: `Bearer ${config.env.COTHREAD_BRIDGE_TOKEN}` },
                body: JSON.stringify({ name: "read_message", args: { messageId } }),
              });
              assert.equal(JSON.parse(await response.json()).text, "测试来源");
              return { finalResponse: '{"ok":true}' };
            },
            async close() {},
          }),
        },
      );
      assert.equal(result.ok, true);
    } finally {
      await bridge.close();
    }
  } finally {
    await database.close();
  }
});
