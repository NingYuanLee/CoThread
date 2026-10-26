import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  createMemoryRelation,
  deleteMemoryRelation,
  listMemoryRelations,
  memoryNeighborhood,
  noteMemoryRecall,
} from "../server/memory-graph.js";
import { applyProjectMemoryResult } from "../server/project-memory.js";
import { memorySubjectLabel } from "../shared/memory-kinds.js";

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
  const project = await service.createProject(owner, { name: "记忆图项目" });
  return { database, db, service, owner, project };
}

async function insertPage(
  db,
  projectId,
  userId,
  { subject = null, title = "条目", body = "## 议题" } = {},
) {
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,'current',?,?)",
    [id, projectId, subject, title, body, userId, userId],
  );
  return id;
}

test("结算写入对象类型，召回统计只加计数", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const applied = await applyProjectMemoryResult(
      db,
      project.id,
      {
        entries: [
          {
            op: "create",
            subject: "discussion",
            subtype: "requirements",
            title: "本轮讨论",
            body: "## 议题\n先做记忆",
            sourceIds: [],
          },
        ],
      },
      { userId: owner.id },
    );
    assert.equal(applied.created.length, 1);
    const [page] = await query(
      db,
      "SELECT subject_type subjectType,recall_count recallCount FROM wiki_pages WHERE id=?",
      [applied.created[0]],
    );
    assert.equal(page.subjectType, "discussion");
    assert.equal(Number(page.recallCount), 0);

    await noteMemoryRecall(db, [applied.created[0], applied.created[0]]);
    const [again] = await query(
      db,
      "SELECT recall_count recallCount,last_recalled_at lastAt FROM wiki_pages WHERE id=?",
      [applied.created[0]],
    );
    assert.equal(Number(again.recallCount), 1);
    assert.ok(again.lastAt);
  } finally {
    await database.close();
  }
});

test("关系：关联可双向读、继承防环、自关联被拒", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "讨论",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "整体",
    });
    const task = await insertPage(db, project.id, owner.id, { subject: "task", title: "任务" });

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
      toPageId: task,
      relation: "relates",
      note: "讨论落到任务",
      createdBy: owner.id,
    });

    const fromDiscussion = await listMemoryRelations(db, project.id, discussion);
    assert.equal(fromDiscussion.length, 2);
    const fromTask = await listMemoryRelations(db, project.id, task);
    assert.equal(fromTask.length, 1, "关联从另一端也读得到");
    assert.equal(fromTask[0].relation, "relates");

    await assert.rejects(
      createMemoryRelation(db, {
        projectId: project.id,
        fromPageId: overall,
        toPageId: discussion,
        relation: "derives",
      }),
      /不能成环/,
    );
    await assert.rejects(
      createMemoryRelation(db, {
        projectId: project.id,
        fromPageId: task,
        toPageId: task,
        relation: "relates",
      }),
      /不能关联自己/,
    );
  } finally {
    await database.close();
  }
});

test("召回：一跳展开带经由关系，可删除关系", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const discussion = await insertPage(db, project.id, owner.id, {
      subject: "discussion",
      title: "讨论",
    });
    const overall = await insertPage(db, project.id, owner.id, {
      subject: "project",
      title: "整体",
    });
    const relation = await createMemoryRelation(db, {
      projectId: project.id,
      fromPageId: discussion,
      toPageId: overall,
      relation: "derives",
      createdBy: owner.id,
    });

    const neighborhood = await memoryNeighborhood(db, project.id, [discussion], { depth: 1 });
    assert.equal(neighborhood.length, 2);
    const hit = neighborhood.find((item) => item.pageId === overall);
    assert.equal(hit.distance, 1);
    assert.equal(hit.via, "derives");
    assert.equal(hit.title, "整体");
    assert.equal(hit.subjectType, "project");

    await deleteMemoryRelation(db, { projectId: project.id, relationId: relation.id });
    const after = await memoryNeighborhood(db, project.id, [discussion], { depth: 1 });
    assert.equal(after.length, 1);
  } finally {
    await database.close();
  }
});

test("发言记忆按项目成员维度存，只记说过什么", async () => {
  const { database, db, owner, project } = await setup();
  try {
    const speaker = randomUUID();
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      speaker,
      speaker + "@test.com",
      "发言人",
    ]);
    const applied = await applyProjectMemoryResult(
      db,
      project.id,
      {
        entries: [
          {
            op: "create",
            subject: "utterance",
            subtype: "experience",
            aboutUserId: speaker,
            title: "发言人对记忆的取舍",
            body: "## 要点\n先做记忆，再谈检索",
            sourceIds: [],
          },
        ],
      },
      { userId: owner.id },
    );
    assert.equal(applied.created.length, 1);
    const [page] = await query(
      db,
      "SELECT subject_type subjectType,about_user_id aboutUserId,subject_type FROM wiki_pages WHERE id=?",
      [applied.created[0]],
    );
    assert.equal(page.subjectType, "utterance");
    assert.equal(page.aboutUserId, speaker);
    assert.equal(memorySubjectLabel("utterance"), "关键发言");
  } finally {
    await database.close();
  }
});
