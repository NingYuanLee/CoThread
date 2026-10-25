import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { saveMemberUnderstandings } from "../server/project-memory.js";
import { upsertUtteranceMemory, utteranceMemoryMarkdown } from "../server/utterance-memory.js";

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
  const project = await service.createProject(owner, { name: "发言记忆项目" });
  return { database, db, owner, project };
}

async function insertMember(db, projectId, name) {
  const id = randomUUID();
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
    id,
    id + "@test.com",
    name,
  ]);
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [
    projectId,
    id,
  ]);
  return id;
}

async function insertThread(db, projectId, userId) {
  const id = randomUUID();
  await query(db, "INSERT INTO threads(id,project_id,title,created_by) VALUES(?,?,?,?)", [
    id,
    projectId,
    "发言迭代",
    userId,
  ]);
  return id;
}

async function insertMessage(db, threadId, authorId, body) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human',?,'[]')",
    [id, threadId, authorId, body],
  );
  return id;
}

test("发言记忆一成员一条，滚动更新且出处去重", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const member = await insertMember(db, project.id, "成员甲");
    const thread = await insertThread(db, project.id, owner.id);
    const first = await insertMessage(db, thread, member, "我主张先做记忆");
    const second = await insertMessage(db, thread, member, "检索可以后做");
    const created = await upsertUtteranceMemory(db, project.id, {
      memberId: member,
      memberName: "成员甲",
      understanding: "他主张先做记忆，再谈检索",
      statementSummary: "先做记忆；检索后置",
      messageIds: [first, second],
      createdBy: member,
    });
    assert.equal(created.created, true);
    const [page] = await query(
      db,
      "SELECT title,body,about_user_id aboutUserId,subject_type subjectType,status FROM wiki_pages WHERE id=?",
      [created.pageId],
    );
    assert.equal(page.subjectType, "utterance");
    assert.equal(page.aboutUserId, member);
    assert.equal(page.status, "current");
    assert.match(page.title, /成员甲/);
    assert.match(page.body, /## 要点/);
    assert.match(page.body, /## 立场与主张/);
    let sources = await query(
      db,
      "SELECT source_id sourceId FROM wiki_page_sources WHERE page_id=?",
      [created.pageId],
    );
    assert.equal(sources.length, 2);

    const again = await upsertUtteranceMemory(db, project.id, {
      memberId: member,
      memberName: "成员甲",
      understanding: "更新后的认识",
      statementSummary: "先做记忆；检索后置",
      messageIds: [first, second],
      createdBy: member,
    });
    assert.equal(again.created, false);
    assert.equal(again.pageId, created.pageId);
    sources = await query(db, "SELECT source_id sourceId FROM wiki_page_sources WHERE page_id=?", [
      created.pageId,
    ]);
    assert.equal(sources.length, 2, "同一消息不重复记出处");
    const pages = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='utterance' AND about_user_id=?",
      [project.id, member],
    );
    assert.equal(pages.length, 1);
    assert.ok(utteranceMemoryMarkdown({ understanding: "要点" }).includes("## 引用提示"));
  } finally {
    await database.close();
  }
});

test("成员记忆保存时同时落发言记忆页", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const member = await insertMember(db, project.id, "成员乙");
    const thread = await insertThread(db, project.id, owner.id);
    const message = await insertMessage(db, thread, member, "这个方案我担心性能");
    const [row] = await query(db, "SELECT sequence FROM messages WHERE id=?", [message]);
    await saveMemberUnderstandings(
      db,
      project.id,
      [
        {
          id: member,
          name: "成员乙",
          throughSequence: "0",
          latestRelatedSequence: String(row.sequence),
        },
      ],
      [
        {
          memberId: member,
          understanding: "他担心性能",
          statementSummary: "担心性能",
        },
      ],
    );
    const [page] = await query(
      db,
      "SELECT id,body FROM wiki_pages WHERE project_id=? AND subject_type='utterance' AND about_user_id=?",
      [project.id, member],
    );
    assert.ok(page, "应落一条发言记忆页");
    assert.match(page.body, /担心性能/);
    const sources = await query(db, "SELECT id FROM wiki_page_sources WHERE page_id=?", [page.id]);
    assert.equal(sources.length, 1);
  } finally {
    await database.close();
  }
});
