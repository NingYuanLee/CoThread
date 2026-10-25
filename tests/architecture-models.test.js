import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents:
      'export {selectMonitorWork,workflowTone} from "./web/agent-monitor-model"; export {taskViewModel} from "./web/task-view-model";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { selectMonitorWork, workflowTone, taskViewModel } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("monitor scopes tasks to the selected iteration, deduplicates claims and excludes terminal pending work", () => {
  const current = {
    task_id: "a",
    thread_id: "one",
    executor_type: "child_agent",
    executor_id: "agent-a",
    agent_slot: 1,
    execution_active: 1,
    status: "running",
    started_at: "2026-10-01",
  };
  const pool = {
    task_id: "a",
    origin_thread_id: "one",
    target_type: "xiaoxiang",
    executor_type: "child_agent",
    executor_id: "agent-a",
    task_status: "running",
    run_status: "running",
  };
  const data = {
    coordinators: [
      { id: "one", title: "当前", status: "active" },
      { id: "archived", status: "archived" },
    ],
    humanAgents: [],
    executors: [current, { ...current, task_id: "foreign", thread_id: "two" }],
    taskPool: [
      pool,
      { ...pool, task_id: "pending", executor_id: null, task_status: "pending_assignment" },
      { ...pool, task_id: "ended", executor_id: null, task_status: "completed" },
      { ...pool, task_id: "foreign", origin_thread_id: "two" },
    ],
  };
  const view = selectMonitorWork(data, "one", 1);
  assert.deepEqual(
    view.activeCoordinators.map((x) => x.id),
    ["one"],
  );
  assert.deepEqual(
    view.claimedTasks.map((x) => x.task_id),
    ["a"],
  );
  assert.deepEqual(
    view.pendingTasks.map((x) => x.task_id),
    ["pending"],
  );
  assert.equal(view.slots.length, 7);
  assert.equal(view.selectedAgent.task.task_id, "a");
  assert.equal(view.selectedAgentState.tone, "running");
  assert.equal(workflowTone("blocked"), "blocked");
  const empty = selectMonitorWork(null, "", 1);
  assert.equal(empty.slots.length, 7);
  assert.equal(empty.pendingTasks.length, 0);
});

test("monitor binds each task to its latest executor slot only", () => {
  const base = {
    goal: "",
    task_type: "formal",
    task_status: "running",
    run_status: "running",
    target_type: "xiaoxiang",
    executor_type: "child_agent",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  const data = {
    coordinators: [{ id: "one", title: "当前", status: "active" }],
    humanAgents: [],
    executors: [],
    taskPool: [
      {
        ...base,
        task_id: "old",
        origin_thread_id: "one",
        executor_id: "agent-a",
        task_status: "completed",
        run_status: "completed",
        started_at: "2026-10-01T01:00:00Z",
      },
      {
        ...base,
        task_id: "moved",
        origin_thread_id: "one",
        executor_id: "agent-b",
        started_at: "2026-10-01T02:00:00Z",
      },
      {
        ...base,
        task_id: "waiting",
        origin_thread_id: "one",
        executor_id: null,
        task_status: "pending_assignment",
        run_status: null,
        started_at: null,
      },
    ],
  };
  const first = selectMonitorWork(data, "one", 1);
  assert.deepEqual(
    first.claimedTasks.map((task) => task.task_id),
    ["old"],
  );
  assert.deepEqual(
    first.pendingTasks.map((task) => task.task_id),
    ["waiting"],
  );
  const second = selectMonitorWork(data, "one", 2);
  assert.deepEqual(
    second.claimedTasks.map((task) => task.task_id),
    ["moved"],
  );
  // 转派后旧槽位不应再出现该任务
  assert.ok(!first.claimedTasks.some((task) => task.task_id === "moved"));
});

test("monitor groups tasks by fixed persona and allows one persona to run parallel sessions", () => {
  const base = {
    goal: "",
    task_type: "formal",
    target_type: "xiaoxiang",
    executor_type: "child_agent",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  const data = {
    coordinators: [{ id: "one", title: "当前", status: "active" }],
    humanAgents: [],
    executors: [],
    taskPool: [
      {
        ...base,
        task_id: "p2-old",
        origin_thread_id: "one",
        persona: "p2",
        task_status: "completed",
        run_status: "completed",
        executor_id: "agent-x",
        started_at: "2026-10-01T01:00:00Z",
      },
      {
        ...base,
        task_id: "p2-run-1",
        origin_thread_id: "one",
        persona: "p2",
        task_status: "running",
        run_status: "running",
        executor_id: "agent-y",
        started_at: "2026-10-01T02:00:00Z",
      },
      {
        ...base,
        task_id: "p2-run-2",
        origin_thread_id: "one",
        persona: "p2",
        task_status: "running",
        run_status: "running",
        executor_id: "agent-z",
        started_at: "2026-10-01T03:00:00Z",
      },
      {
        ...base,
        task_id: "p1-task",
        origin_thread_id: "one",
        persona: "p1",
        task_status: "running",
        run_status: "running",
        executor_id: "agent-w",
        started_at: "2026-10-01T00:30:00Z",
      },
      {
        ...base,
        task_id: "p3-waiting",
        origin_thread_id: "one",
        persona: "p3",
        task_status: "pending_assignment",
        run_status: null,
        executor_id: null,
        started_at: null,
      },
    ],
  };
  const second = selectMonitorWork(data, "one", 2);
  assert.equal(second.selectedAgent.agent.name, "二娃");
  assert.equal(second.slots[1].persona, "p2");
  assert.equal(second.slots[1].running, 2);
  // 同人设并行：两个会话都列在二娃右栏，正在跑的排在前面
  assert.deepEqual(
    second.claimedTasks
      .map((task) => task.task_id)
      .slice(0, 2)
      .sort(),
    ["p2-run-1", "p2-run-2"],
  );
  assert.equal(second.claimedTasks.length, 3);
  assert.deepEqual(
    selectMonitorWork(data, "one", 1).claimedTasks.map((task) => task.task_id),
    ["p1-task"],
  );
  assert.deepEqual(
    second.pendingTasks.map((task) => task.task_id),
    ["p3-waiting"],
  );
});

test("task view keeps member responsibility distinct from 子 Agent identity and hides ended unbound assist work", () => {
  const user = { id: "member", name: "甲" },
    detail = {
      members: [
        { id: "member", name: "甲" },
        { id: "other", name: "乙" },
      ],
    };
  const base = {
    id: "one",
    origin_thread_id: "thread",
    task_type: "formal",
    target_type: "human_member",
    target_id: "member",
    source_user_id: "other",
    status: "running",
    updated_at: "2026-10-01",
    created_at: "2026-10-01",
    thread_number: 1,
  };
  const tasks = [
    base,
    { ...base, id: "newer", updated_at: "2026-10-02", thread_number: 2 },
    {
      ...base,
      id: "hidden",
      task_type: "assist",
      status: "completed",
      execution_agent_id: null,
    },
    { ...base, id: "foreign", origin_thread_id: "another" },
  ];
  const model = taskViewModel(tasks, detail, user, "thread");
  assert.equal(model.latestMyTask.id, "newer");
  assert.deepEqual(
    model.scopedTasks.map((x) => x.id),
    ["one", "newer"],
  );
  assert.equal(model.taskSourceLabel(base), "乙");
  assert.equal(model.taskTargetLabel(base), "甲");
  assert.deepEqual(
    taskViewModel(tasks, detail, user, "thread", true, "#2").visibleTasks.map((x) => x.id),
    ["newer"],
  );
});
