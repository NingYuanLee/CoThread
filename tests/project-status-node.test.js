import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  ensureProjectStatusNode,
  readProjectStatusNode,
  applyProjectStatusNode,
  listProjectStatusHistory,
} from "../server/project-status-node.js";
import {
  processNextProjectMemory,
  loadProjectSummary,
  noteProjectMemorySignal,
  maybeQueueProjectMemoryRun,
  inspectProjectMemorySources,
} from "../server/project-memory.js";
import {
  queueProjectStatusRecheck,
  queueMissingProjectStatus,
} from "../server/project-status-scheduler.js";
import { searchProjectMemory } from "../server/memory-search.js";

test("项目现状有唯一标识，普通里程碑不会被当作现状", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "现状测试" });
    const ordinary = randomUUID();
    await query(
      db,
      "INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by) VALUES(?,?,'project','phase_change','阶段成果','## 当前状态\n历史成果','current',?,?)",
      [ordinary, project.id, user.id, user.id],
    );
    assert.equal(await readProjectStatusNode(db, project.id), null);
    const ids = await Promise.all([
      ensureProjectStatusNode(db, project.id, user.id),
      ensureProjectStatusNode(db, project.id, user.id),
    ]);
    assert.equal(ids[0], ids[1]);
    assert.notEqual(ids[0], ordinary);
    await query(db, "UPDATE wiki_pages SET body='## 当前状态\n正在整理文件' WHERE id=?", [ids[0]]);
    assert.equal((await readProjectStatusNode(db, project.id)).id, ids[0]);
  } finally {
    await database.close();
  }
});

test("旧项目摘要保留为待核实历史，现状另行核对且回填幂等", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "旧项目" });
    await query(db, "DELETE FROM agent_project_memory_queue WHERE project_id=?", [project.id]);
    await query(db, "DELETE FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory'", [
      project.id,
    ]);
    await query(db, "INSERT INTO agent_project_summaries(project_id,summary) VALUES(?,?)", [
      project.id,
      "旧目标与旧结论",
    ]);
    assert.equal(await queueMissingProjectStatus(db, project.id), project.id);
    const status = await readProjectStatusNode(db, project.id);
    assert.doesNotMatch(status.body, /旧目标与旧结论/);
    const [legacy] = await query(
      db,
      "SELECT status,body FROM wiki_pages WHERE project_id=? AND title='历史项目摘要（待核实）'",
      [project.id],
    );
    assert.equal(legacy.status, "current");
    assert.match(legacy.body, /旧目标与旧结论/);
    assert.equal(await queueMissingProjectStatus(db, project.id), null);
    const [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND title='历史项目摘要（待核实）'",
      [project.id],
    );
    assert.equal(Number(count.count), 1);
  } finally {
    await database.close();
  }
});

test("较长的旧摘要按 UTF-8 字节拆分，完整保留且不冒充现状", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "长历史" });
    const summary = "甲".repeat(11000) + "尾";
    await query(db, "INSERT INTO agent_project_summaries(project_id,summary) VALUES(?,?)", [
      project.id,
      summary,
    ]);
    await ensureProjectStatusNode(db, project.id, user.id);
    const pages = await query(
      db,
      "SELECT body FROM wiki_pages WHERE project_id=? AND title LIKE '历史项目摘要（待核实）%' ORDER BY title",
      [project.id],
    );
    assert.equal(pages.length, 2);
    assert.equal(
      pages.map((page) => page.body.replace(/^## 历史摘要（待核实）\n\n/, "")).join(""),
      summary,
    );
    assert.doesNotMatch((await readProjectStatusNode(db, project.id)).body, /甲/);
  } finally {
    await database.close();
  }
});

test("现状历史保留业务事件快照，来源自然变化不删除旧事实", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "历史测试" });
    const [first] = await query(
      db,
      "SELECT id FROM project_change_logs WHERE project_id=? AND action='created'",
      [project.id],
    );
    await ensureProjectStatusNode(db, project.id, user.id);
    const write = async (sourceId, body) => {
      const snapshot = await readProjectStatusNode(db, project.id);
      const [source] = await inspectProjectMemorySources(db, project.id, [
        { kind: "milestone", id: sourceId },
      ]);
      await transaction(db, (conn) =>
        applyProjectStatusNode(
          conn,
          project.id,
          user.id,
          snapshot,
          { op: "update", body, sourceIds: [sourceId] },
          [source],
        ),
      );
    };
    await write(first.id, "## 当前状态\n第一版现状");
    await service.updateProject(user, project.id, { description: "新背景" });
    const [second] = await query(
      db,
      "SELECT id FROM project_change_logs WHERE project_id=? AND action='profile_updated'",
      [project.id],
    );
    await write(second.id, "## 当前状态\n第二版现状");
    let history = await listProjectStatusHistory(service, user, project.id);
    assert.ok(history.some((item) => item.body?.includes("第一版现状")));
    await query(db, "DELETE FROM project_change_logs WHERE id=?", [first.id]);
    history = await listProjectStatusHistory(service, user, project.id);
    assert.ok(history.some((item) => item.sourceNeedsReview && item.body?.includes("第一版现状")));
    const outsider = { id: randomUUID(), kind: "session" };
    await assert.rejects(listProjectStatusHistory(service, outsider, project.id));
  } finally {
    await database.close();
  }
});

test("里程碑保存后现状失败，可仅重做现状而不重复建条", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "部分恢复" });
    const proposal = (context, body) => ({
      entries: [
        {
          op: "create",
          subject: "project",
          subtype: "project_origin",
          title: "项目创建",
          body: "项目开始",
          sourceIds: [context.candidates[0].queueId],
        },
      ],
      projectStatus: { op: "update", body, sourceIds: [context.candidates[0].queueId] },
    });
    const base = {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
    };
    await processNextProjectMemory(db, {
      ...base,
      summarizeMemory: async (context) => proposal(context, "错误格式"),
    });
    let [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND title='项目创建'",
      [project.id],
    );
    const [run] = await query(
      db,
      "SELECT status,error FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(Number(count.count), 1, run?.error);
    const [checkpoint] = await query(
      db,
      "SELECT milestones_done,status_done,status_error FROM project_memory_settlements WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(checkpoint.milestones_done), 1);
    assert.equal(Number(checkpoint.status_done), 0);
    assert.match(checkpoint.status_error, /格式无效/);
    await service.updateProject(user, project.id, { description: "失败后出现的新事件" });
    await query(
      db,
      "UPDATE agent_project_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [project.id],
    );
    await maybeQueueProjectMemoryRun(db, project.id, true);
    await processNextProjectMemory(db, {
      ...base,
      summarizeMemory: async (context) => proposal(context, "## 当前状态\n准备中"),
    });
    [count] = await query(
      db,
      "SELECT COUNT(*) count FROM wiki_pages WHERE project_id=? AND title='项目创建'",
      [project.id],
    );
    assert.equal(Number(count.count), 1);
    assert.match((await readProjectStatusNode(db, project.id)).body, /准备中/);
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(pending.count), 1, "新事件应留给下一批处理");
  } finally {
    await database.close();
  }
});

test("核验后出处被修改时不能提交旧结论", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "出处竞态" });
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      summarizeMemory: async (context) => ({
        entries: [],
        projectStatus: {
          op: "update",
          body: "## 当前状态\n旧证据结论",
          sourceIds: [context.candidates[0].queueId],
        },
      }),
      verifyMemorySupport: async (_id, _result, candidates) => {
        await query(db, "UPDATE project_change_logs SET details=? WHERE id=?", [
          JSON.stringify({ changed: true }),
          candidates[0].sourceId,
        ]);
        return { supported: true };
      },
    });
    assert.doesNotMatch((await readProjectStatusNode(db, project.id)).body, /旧证据结论/);
    const [run] = await query(
      db,
      "SELECT status,error FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(run.status, "failed");
    assert.match(run.error, /出处已变化/);
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(pending.count), 1);
  } finally {
    await database.close();
  }
});

test("里程碑维护使用只读工具桥并执行独立支持性核验", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const project = await new Service(db).createProject(user, { name: "工具核验" });
    const [candidate] = await query(
      db,
      "SELECT id FROM agent_project_memory_queue WHERE project_id=? AND source_kind='milestone'",
      [project.id],
    );
    const responses = [
      JSON.stringify({
        entries: [],
        projectStatus: { op: "update", body: "## 当前状态\n项目已创建", sourceIds: [candidate.id] },
      }),
      JSON.stringify({ supported: true, reason: "创建事件支持" }),
    ];
    const envs = [];
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      laowengOptions: {
        model: {
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "test",
          model: "test",
          reasoningEffort: "low",
        },
        createHarness: (options) => ({
          async start() {},
          async run() {
            envs.push(options.env);
            return { finalResponse: responses.shift() };
          },
          async close() {},
        }),
      },
    });
    assert.equal(envs.length, 2, "生成后应进行独立核验");
    assert.ok(envs[0].COTHREAD_BRIDGE_URL);
    assert.match((await readProjectStatusNode(db, project.id)).body, /项目已创建/);
    await new Service(db).updateProject(user, project.id, { description: "继续更新" });
    responses.push(
      JSON.stringify({ entries: [], projectStatus: { op: "unchanged" } }),
      JSON.stringify({ supported: false, reason: "现状需要重新核实" }),
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      laowengOptions: {
        model: {
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "test",
          model: "test",
          reasoningEffort: "low",
        },
        createHarness: () => ({
          async start() {},
          async run() {
            return { finalResponse: responses.shift() };
          },
          async close() {},
        }),
      },
    });
    const [pending] = await query(
      db,
      "SELECT last_error FROM agent_project_memory_queue WHERE project_id=? AND last_error IS NOT NULL",
      [project.id],
    );
    assert.match(pending?.last_error || "", /现状需要重新核实/);
  } finally {
    await database.close();
  }
});

test("项目变更有真实出处，现状写入与候选消费一同完成", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "里程碑测试" });
    await service.updateProject(user, project.id, { description: "新的项目描述" });
    let input;
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "project_memory",
        verifyMemorySupport: async () => ({ supported: true }),
        summarizeMemory: async (context) => {
          input = context;
          const change = context.candidates.find((candidate) =>
            candidate.text.includes("profile_updated"),
          );
          assert.ok(change?.verified);
          return {
            entries: [],
            projectStatus: {
              op: "update",
              body: "## 当前状态\n\n- 项目处于准备阶段。",
              sourceIds: [change.queueId],
            },
          };
        },
      }),
      true,
    );
    const status = await readProjectStatusNode(db, project.id);
    assert.match(status.body, /准备阶段/);
    assert.match((await loadProjectSummary(db, project.id)).summary, /准备阶段/);
    const [source] = await query(
      db,
      "SELECT source_kind,source_id FROM wiki_page_sources WHERE page_id=?",
      [status.id],
    );
    assert.equal(source.source_kind, "milestone");
    assert.ok(input.candidates.some((candidate) => candidate.sourceId === source.source_id));
    const [pending] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=? AND source_kind<>'message'",
      [project.id],
    );
    assert.equal(Number(pending.count), 0);
    await service.updateProject(user, project.id, { description: "更新后的描述" });
    assert.equal(Number((await readProjectStatusNode(db, project.id)).sourceNeedsReview), 1);
    const search = await searchProjectMemory(db, project.id, { query: "项目现状", depth: 0 });
    assert.match(
      search.entries.find((entry) => entry.pageId === status.id)?.excerpt || "",
      /现状待核实/,
    );
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async (context) => {
        const change = context.candidates[0];
        await noteProjectMemorySignal(
          db,
          project.id,
          change.sourceKind,
          change.sourceId,
          "重复触发",
          { urgent: true },
        );
        return {
          entries: [],
          projectStatus: { op: "update", body: "## 当前状态\n旧分析", sourceIds: [change.queueId] },
        };
      },
    });
    assert.match((await readProjectStatusNode(db, project.id)).body, /准备阶段/);
    const [retained] = await query(
      db,
      "SELECT source_kind kind,source_id sourceId FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.ok(retained);
    await noteProjectMemorySignal(db, project.id, retained.kind, retained.sourceId, "重试", {
      urgent: true,
    });
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      verifyMemorySupport: async () => ({ supported: true }),
      summarizeMemory: async () => ({ entries: [], projectStatus: { op: "unchanged" } }),
    });
    const [remaining] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(remaining.count), 0, "正常零产出应消费候选");
    await service.updateProject(user, project.id, { description: "需要核验的变更" });
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "project_memory",
      summarizeMemory: async (context) => ({
        entries: [],
        projectStatus: {
          op: "update",
          body: "## 当前状态\n无法证明的结论",
          sourceIds: [context.candidates[0].queueId],
        },
      }),
      verifyMemorySupport: async () => ({ supported: false, reason: "来源不能支持结论" }),
    });
    assert.doesNotMatch((await readProjectStatusNode(db, project.id)).body, /无法证明/);
    const [failed] = await query(
      db,
      "SELECT status,error FROM agent_laoweng_runs WHERE project_id=? AND task='project_memory' ORDER BY created_at DESC,id DESC LIMIT 1",
      [project.id],
    );
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /来源不能支持结论/);
    const [left] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(left.count), 1, "核验失败应保留候选");
    const [retry] = await query(
      db,
      "SELECT retry_count,last_error,last_attempt_at FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(retry.retry_count), 1);
    assert.match(retry.last_error, /来源不能支持结论/);
    assert.ok(retry.last_attempt_at);
    await query(
      db,
      "UPDATE agent_project_memory_queue SET available_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [project.id],
    );
    assert.equal(
      await processNextProjectMemory(db, {
        projectId: project.id,
        task: "project_memory",
        summarizeMemory: async () => ({ entries: [], projectStatus: { op: "unchanged" } }),
        verifyMemorySupport: async () => ({ supported: true }),
      }),
      true,
      "到期失败候选应自动重试",
    );
    const [cleared] = await query(
      db,
      "SELECT COUNT(*) count FROM agent_project_memory_queue WHERE project_id=?",
      [project.id],
    );
    assert.equal(Number(cleared.count), 0);
    await query(
      db,
      "UPDATE project_status_nodes SET last_checked_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY) WHERE project_id=?",
      [project.id],
    );
    assert.equal(await queueProjectStatusRecheck(db, project.id), project.id);
    assert.equal(
      await queueProjectStatusRecheck(db, project.id),
      null,
      "重复定期检查不能立即再次排队",
    );
  } finally {
    await database.close();
  }
});
