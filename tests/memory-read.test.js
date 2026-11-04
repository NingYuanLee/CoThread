import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createApp } from "../server/app.js";
import { issueCredential } from "../server/auth.js";
import { listProjectMemoryEntries, readProjectMemory } from "../server/memory-timeline.js";
import { createMemoryRelation } from "../server/memory-graph.js";

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
  const project = await service.createProject(owner, { name: "记忆读项目" });
  return { database, db, service, owner, project };
}

async function insertPage(
  db,
  projectId,
  userId,
  { subject, subtype = null, aboutUserId = null, title, body = "## 内容", status = "current" },
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,about_user_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [id, projectId, subject, subtype, aboutUserId, title, body, status, userId, userId],
  );
  return id;
}

test("读接口返回对象类型与关系边", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const member = randomUUID();
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      member,
      member + "@test.com",
      "发言人",
    ]);
    const speech = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      aboutUserId: member,
      title: "发言人的发言",
    });
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "项目整体",
    });
    await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: overall,
      relation: "derives",
      createdBy: owner.id,
    });
    await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: speech,
      relation: "relates",
      createdBy: owner.id,
    });

    const data = await readProjectMemory(service, owner, project.id);
    assert.ok(
      data.members.some((member) => member.id === owner.id),
      "读接口应返回项目成员",
    );
    const byId = new Map(data.entries.map((entry) => [entry.id, entry]));
    assert.equal(byId.get(speech).subject, "utterance");
    assert.equal(byId.get(speech).aboutUserId, member);
    assert.equal(byId.get(discussion).subject, "discussion");
    assert.equal(byId.get(overall).subject, "project");
    const edges = byId.get(discussion).relations;
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.direction === "out"));
    const derives = edges.find((edge) => edge.relation === "derives");
    assert.equal(derives.otherPageId, overall);
    assert.equal(derives.otherTitle, "项目整体");
    const fromOther = byId.get(overall).relations;
    assert.equal(fromOther.length, 1);
    assert.equal(fromOther[0].direction, "in");
    assert.equal(fromOther[0].otherTitle, "是否引入向量检索");
  } finally {
    await database.close();
  }
});

test("分页接口默认返回第一页且与读接口条目同构", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    // 建项目会自动生成文件索引根页，默认查询应包含它们。
    const baseline = await listProjectMemoryEntries(service, owner, project.id, {});
    await insertPage(db, project.id, owner.id, { subject: "utterance", title: "发言人的发言" });
    await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    await insertPage(db, project.id, owner.id, { subject: "project", title: "项目整体" });
    const expectedTotal = baseline.total + 3;
    const page = await listProjectMemoryEntries(service, owner, project.id, {});
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 20);
    assert.equal(page.total, expectedTotal);
    assert.equal(page.hasMore, expectedTotal > 20);
    assert.equal(page.items.length, Math.min(20, expectedTotal));
    const read = await readProjectMemory(service, owner, project.id);
    const expected = new Map(read.entries.map((entry) => [entry.id, entry]));
    for (const item of page.items) assert.deepEqual(item, expected.get(item.id));
    // 非法 subject 按 all 处理。
    const bogus = await listProjectMemoryEntries(service, owner, project.id, { subject: "bogus" });
    assert.deepEqual(bogus, page);
  } finally {
    await database.close();
  }
});

test("分页接口按 subject 筛选", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    await insertPage(db, project.id, owner.id, { subject: "utterance", title: "发言人的发言" });
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    await insertPage(db, project.id, owner.id, { subject: "project", title: "项目整体" });
    const page = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "discussion",
    });
    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].id, discussion);
    assert.equal(page.items[0].subject, "discussion");
  } finally {
    await database.close();
  }
});

test("分页接口 subject 为空时只返回未分类记忆", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const plain = await insertPage(db, project.id, owner.id, {
      subject: null,
      title: "未分类记忆",
    });
    await insertPage(db, project.id, owner.id, { subject: "utterance", title: "发言人的发言" });
    /* 前端「其它记忆」这一档传的就是空 subject，语义是 subject_type 为空的条目。 */
    const others = await listProjectMemoryEntries(service, owner, project.id, { subject: "" });
    assert.ok(others.items.some((item) => item.id === plain));
    assert.ok(others.items.every((item) => !item.subject));
    const all = await listProjectMemoryEntries(service, owner, project.id, {});
    assert.ok(all.total > others.total, "全部应同时包含有分类的条目");
    const othersPage = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "",
      page: 2,
      pageSize: 1,
    });
    assert.equal(othersPage.page, 2);
    assert.equal(othersPage.items.length, others.total > 1 ? 1 : 0);
    assert.equal(othersPage.hasMore, false);
  } finally {
    await database.close();
  }
});

test("分页接口按 subtypes 筛选", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const judged = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      subtype: "key_judgment",
      title: "这是一条关键判断",
    });
    const decided = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      subtype: "decision",
      title: "这是一条重要决策",
    });
    await insertPage(db, project.id, owner.id, { subject: "utterance", title: "没有二级类型" });
    const one = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "utterance",
      subtypes: "key_judgment",
    });
    assert.equal(one.total, 1);
    assert.deepEqual(
      one.items.map((item) => item.id),
      [judged],
    );
    const two = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "utterance",
      subtypes: "key_judgment,decision",
    });
    assert.equal(two.total, 2);
    assert.deepEqual(two.items.map((item) => item.id).sort(), [judged, decided].sort());
    const empty = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "utterance",
      subtypes: "",
    });
    assert.equal(empty.total, 3);
  } finally {
    await database.close();
  }
});

test("分页接口按 statuses 筛选", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const current = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "现行条目",
    });
    const superseded = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "作废条目",
      status: "superseded",
    });
    const onlyCurrent = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      statuses: "current",
    });
    assert.equal(onlyCurrent.total, 1);
    assert.deepEqual(
      onlyCurrent.items.map((item) => item.id),
      [current],
    );
    const both = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      statuses: "current,superseded",
    });
    assert.equal(both.total, 2);
    assert.deepEqual(both.items.map((item) => item.id).sort(), [current, superseded].sort());
    const all = await listProjectMemoryEntries(service, owner, project.id, { subject: "project" });
    assert.equal(all.total, 2);
  } finally {
    await database.close();
  }
});

test("分页接口关键词匹配标题或二级类型中文标签", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const byTitle = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "是否引入向量检索",
    });
    const byLabel = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      subtype: "decision",
      title: "采用 MySQL 存储",
    });
    const percent = await insertPage(db, project.id, owner.id, {
      subject: "document",
      title: "覆盖率100%的说明",
    });
    await insertPage(db, project.id, owner.id, {
      subject: "document",
      title: "覆盖率1000说明",
    });
    const titleHit = await listProjectMemoryEntries(service, owner, project.id, { q: "向量" });
    assert.deepEqual(
      titleHit.items.map((item) => item.id),
      [byTitle],
    );
    // “重要决策”是 decision 的中文标签，标题里没有这个词也应命中。
    const labelHit = await listProjectMemoryEntries(service, owner, project.id, {
      q: "重要决策",
    });
    assert.deepEqual(
      labelHit.items.map((item) => item.id),
      [byLabel],
    );
    // key 匹配大小写不敏感。
    const keyHit = await listProjectMemoryEntries(service, owner, project.id, {
      q: "DECISION",
    });
    assert.deepEqual(
      keyHit.items.map((item) => item.id),
      [byLabel],
    );
    // 关键词中的 % 必须按字面匹配。
    const escapedHit = await listProjectMemoryEntries(service, owner, project.id, { q: "100%" });
    assert.deepEqual(
      escapedHit.items.map((item) => item.id),
      [percent],
    );
  } finally {
    await database.close();
  }
});

test("分页接口第二页与 hasMore", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    const ids = [];
    for (const title of ["第一条", "第二条", "第三条"])
      ids.push(await insertPage(db, project.id, owner.id, { subject: "project", title }));
    const first = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      pageSize: 2,
    });
    assert.equal(first.page, 1);
    assert.equal(first.total, 3);
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    const second = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      page: 2,
      pageSize: 2,
    });
    assert.equal(second.page, 2);
    assert.equal(second.total, 3);
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
    const collected = [...first.items, ...second.items].map((item) => item.id).sort();
    assert.deepEqual(collected, [...ids].sort());
  } finally {
    await database.close();
  }
});

test("分页接口处理非法分页参数与 pageSize 上限", async () => {
  const { database, db, service, owner, project } = await setup();
  try {
    await insertPage(db, project.id, owner.id, { subject: "project", title: "唯一条目" });
    const capped = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      pageSize: 500,
    });
    assert.equal(capped.pageSize, 100);
    assert.equal(capped.page, 1);
    const invalidSize = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      pageSize: "abc",
    });
    assert.equal(invalidSize.pageSize, 20);
    const invalidPage = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      page: 0,
    });
    assert.equal(invalidPage.page, 1);
    const invalidPageText = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      page: "x",
    });
    assert.equal(invalidPageText.page, 1);
    const beyond = await listProjectMemoryEntries(service, owner, project.id, {
      subject: "project",
      page: 5,
    });
    assert.equal(beyond.items.length, 0);
    assert.equal(beyond.total, 1);
    assert.equal(beyond.hasMore, false);
  } finally {
    await database.close();
  }
});

test("非项目成员读记忆条目返回 403", async () => {
  const { database, db, service, project } = await setup();
  try {
    const outsider = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      outsider.id,
      outsider.id + "@test.com",
      "路人",
    ]);
    await assert.rejects(
      () => listProjectMemoryEntries(service, outsider, project.id, {}),
      (error) => error.status === 403,
    );
  } finally {
    await database.close();
  }
});

test("HTTP 分页接口返回筛选结果并对非成员 403", async () => {
  const { database, db, owner, project } = await setup();
  let server;
  try {
    const judged = await insertPage(db, project.id, owner.id, {
      subject: "utterance",
      subtype: "key_judgment",
      title: "这是一条关键判断",
    });
    await insertPage(db, project.id, owner.id, { subject: "utterance", title: "普通发言" });
    const outsider = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      outsider.id,
      outsider.id + "@test.com",
      "路人",
    ]);
    server = createApp(db).listen(0, "127.0.0.1");
    await new Promise((done) => server.once("listening", done));
    const base = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/memory/entries`;
    const tokenOf = async (userId, label) =>
      (await issueCredential(db, userId, "session", label)).token;
    const ownerToken = await tokenOf(owner.id, "memory-entries-owner");
    const outsiderToken = await tokenOf(outsider.id, "memory-entries-outsider");
    const get = (search, token) =>
      fetch(base + search, { headers: { Cookie: "cothread_session=" + token } });

    const response = await get(
      "?subject=utterance&subtypes=key_judgment&page=1&pageSize=1",
      ownerToken,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 1);
    assert.equal(body.total, 1);
    assert.equal(body.hasMore, false);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, judged);
    assert.equal((await get("", outsiderToken)).status, 403);
  } finally {
    if (server) await new Promise((done) => server.close(done));
    await database.close();
  }
});
