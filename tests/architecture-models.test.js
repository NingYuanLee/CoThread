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
    executor_type: "dsh_l3",
    executor_id: "agent-a",
    agent_slot: 1,
    execution_active: 1,
    status: "running",
    started_at: "2026-10-01",
  };
  const pool = {
    task_id: "a",
    origin_thread_id: "one",
    target_type: "l2_session",
    executor_type: "dsh_l3",
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

test("task view keeps member responsibility distinct from L3 identity and hides ended unbound assist work", () => {
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
      task_type: "assist_l2",
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
