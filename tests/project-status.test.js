import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { readProjectStatus, writeProjectStatus } from "../server/project-status.ts";
import {
  loadProjectSummary,
  noteProjectMemorySignal,
  processNextProjectMemory,
} from "../server/project-memory.ts";
import { scanProjectMemorySignals } from "../server/project-memory-scan.ts";

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
  const project = await service.createProject(owner, { name: "现状项目" });
  const thread = await service.createThread(owner, project.id, { title: "第一轮" });
  /* 项目进程信号改由扫描生成：先建水位，再制造一次项目级变更作为候选。 */
  await scanProjectMemorySignals(db, project.id);
  await service.projectChange(db, project.id, owner.id, "profile_updated", { name: "现状项目" });
  await scanProjectMemorySignals(db, project.id);
  return { database, db, service, owner, project, thread };
}

function projectEntry(context, title, body) {
  return {
    op: "create",
    subject: "project",
    subtype: "phase_change",
    title,
    body,
    sourceIds: context.candidates.map((candidate) => candidate.queueId),
  };
}

test("提交新进程条目时覆盖项目现状，只保留一行且不留历史表", async () => {
  const { database, db, owner, project, thread } = await setup();
  try {
    const first = await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => ({
        entries: [projectEntry(context, "第一阶段", "## 第一阶段\n\n- 完成骨架")],
        statusMarkdown: "## 当前状态\n\n- 第一阶段，骨架已完成。",
      }),
    });
    assert.equal(first, true);
    assert.match((await readProjectStatus(db, project.id)).body, /骨架已完成/);

    const changeLogId = randomUUID();
    await query(
      db,
      "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [
        changeLogId,
        project.id,
        owner.id,
        "iteration_context_updated",
        JSON.stringify({ threadId: thread.id, title: "第二轮" }),
      ],
    );
    await noteProjectMemorySignal(db, project.id, "milestone", changeLogId, "第二轮", {
      urgent: true,
    });
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => ({
        entries: [projectEntry(context, "第二阶段", "## 第二阶段\n\n- 进入联调")],
        statusMarkdown: "## 当前状态\n\n- 第二阶段，进入联调。",
      }),
    });
    const rows = await query(db, "SELECT body FROM project_status WHERE project_id=?", [
      project.id,
    ]);
    assert.equal(rows.length, 1, "现状只有一份 md");
    assert.match(rows[0].body, /进入联调/);
    assert.doesNotMatch(rows[0].body, /骨架已完成/, "整份覆盖，不保留旧内容");

    const [legacy] = await query(
      db,
      `SELECT COUNT(*) count FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
       ('project_status_nodes','project_status_revisions','project_status_source_snapshots')`,
    );
    assert.equal(Number(legacy.count), 0, "旧的现状节点、修订与来源快照表应已删除");
  } finally {
    await database.close();
  }
});

test("没有新增或更新条目时不覆盖现状", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await writeProjectStatus(db, project.id, "## 当前状态\n\n- 已有现状。", owner.id);
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async () => ({
        entries: [],
        statusMarkdown: "## 当前状态\n\n- 不应被写入。",
      }),
    });
    assert.match((await readProjectStatus(db, project.id)).body, /已有现状/);
  } finally {
    await database.close();
  }
});

test("条目更新缺少现状正文时整次结算失败并保留候选", async () => {
  const { database, db, project } = await setup();
  try {
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => ({
        entries: [projectEntry(context, "无现状", "## 无现状\n\n- 正文")],
        statusMarkdown: "",
      }),
    });
    assert.equal(await readProjectStatus(db, project.id), null);
    const [failed] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' AND status='failed'",
      [project.id],
    );
    assert.equal(Number(failed.count), 1);
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.ok(Number(pending.count) >= 1, "候选应保留重试");
  } finally {
    await database.close();
  }
});

test("只提交任务条目时可以不带项目现状，条目照常写入", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await writeProjectStatus(db, project.id, "## 当前状态\n\n- 已有现状。", owner.id);
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => ({
        entries: [
          {
            op: "create",
            subject: "task",
            subtype: "blocked_task",
            title: "替换默认头像",
            body: "## 任务概况\n\n- 被阻塞",
            sourceIds: context.candidates.map((candidate) => candidate.queueId),
          },
        ],
        statusMarkdown: null,
      }),
    });
    const [run] = await query(
      db,
      `SELECT status,item_count FROM agent_laoweng_runs
       WHERE project_id=? AND task='project_memory' ORDER BY created_at DESC LIMIT 1`,
      [project.id],
    );
    assert.equal(run.status, "completed");
    assert.equal(Number(run.item_count), 1);
    assert.match((await readProjectStatus(db, project.id)).body, /已有现状/, "现状保持原样");
    const pages = await query(db, "SELECT id FROM wiki_pages WHERE project_id=? AND title=?", [
      project.id,
      "替换默认头像",
    ]);
    assert.equal(pages.length, 1, "任务条目应写入，不因缺少现状正文回滚");
  } finally {
    await database.close();
  }
});

test("项目进程条目返回 null 现状时整次结算失败并保留候选", async () => {
  const { database, db, project } = await setup();
  try {
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => ({
        entries: [projectEntry(context, "无现状", "## 无现状\n\n- 正文")],
        statusMarkdown: null,
      }),
    });
    assert.equal(await readProjectStatus(db, project.id), null);
    const [failed] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' AND status='failed'",
      [project.id],
    );
    assert.equal(Number(failed.count), 1);
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.ok(Number(pending.count) >= 1, "候选应保留重试");
  } finally {
    await database.close();
  }
});

test("导读读取项目现状 md", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await writeProjectStatus(db, project.id, "## 当前状态\n\n- 正在联调。", owner.id);
    const summary = await loadProjectSummary(db, project.id);
    assert.match(summary.summary, /正在联调/);
  } finally {
    await database.close();
  }
});

test("现状只保存正文，去掉标题、列表与加粗修饰", async () => {
  const { database, db, owner, project } = await setup();
  try {
    await writeProjectStatus(
      db,
      project.id,
      "## 当前状态\n\n**进行中**：正在联调\n\n- 待验证\n---",
      owner.id,
    );
    assert.equal((await readProjectStatus(db, project.id)).body, "进行中：正在联调\n\n待验证");
  } finally {
    await database.close();
  }
});
