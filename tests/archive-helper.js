import { query } from "../server/db.js";
import { processNextProjectMemory } from "../server/project-memory.js";

// Legacy integration scenarios exercise the final archived state. Complete both
// stages explicitly; iteration-archive.test.js tests the individual HTTP stages.
//
// 此组测试只验收归档 HTTP 与持久状态。生产启动器另有阶段测试覆盖；
// 显式保留队列，由本 helper 注入模拟总结器，避免真实模型先认领导致竞态与超时。
export const archiveAppOptions = { startArchiveDraft: async () => {} };
const POLL_ATTEMPTS = 90;
const POLL_INTERVAL_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function completeArchiveRequest(db, request, path, data, credential) {
  const begun = await request(path, data, credential);
  const threadId0 = path.split("/")[2];
  // 本 helper 关心的是「这个迭代最后是否归档成功」。归档正在途中（同一迭代会跨用例复用）
  // 就当幂等处理，继续推到完成；但已经归档完成时必须把 409 原样交回，
  // 因为调用方正是用它来判断「归档后不可重复归档」。
  const inFlight =
    begun.status === 409 &&
    String(begun.body?.error || "").includes("已进入归档流程") &&
    (await query(db, "SELECT status FROM threads WHERE id=?", [threadId0]))[0]?.status ===
      "archiving";
  if (!inFlight && (begun.status !== 200 || begun.body.status !== "archiving")) return begun;
  const threadId = path.split("/")[2];
  const [thread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);

  let workflow = begun.body;
  let retried = false;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    workflow = (await request(path, undefined, credential)).body;
    if (workflow.status === "ready") break;
    if (workflow.status === "failed" && !retried) {
      retried = true;
      await request(path + "/retry", { workflowId: workflow.id }, credential);
    }
    // 只有没人领过这次梳理时才需要测试自己驱动；已被领走时这里是空操作。
    await processNextProjectMemory(db, {
      projectId: thread.project_id,
      task: "iteration_archive",
      summarizeArchive: async (context) =>
        context.phase === "memory"
          ? "已确认的归档测试总结"
          : {
              conclusion: data?.conclusion || "本轮已结束",
              taskDecisions: (context.snapshot.tasks || [])
                .filter(
                  (task) =>
                    ![
                      "completed",
                      "failed",
                      "cancelled",
                      "rejected",
                      "abandoned",
                      "superseded",
                    ].includes(task.status),
                )
                .map((task) => ({ taskId: task.id, disposition: "retain", reason: "随本轮留档" })),
              notes: "",
              nextIteration: { title: "", background: "", goal: "" },
            },
    });
    await sleep(POLL_INTERVAL_MS);
  }
  if (workflow.status !== "ready") return { ...workflow, status: workflow.status };

  // 确认阶段要求未完成项与去向一一对应。草稿可能由服务端真模型产出，
  // 它的决策未必刚好覆盖库中的未完成项，所以这里按库中现状补齐再去确认。
  const ended = new Set([
    "completed",
    "failed",
    "cancelled",
    "rejected",
    "abandoned",
    "superseded",
  ]);
  const openTasks = (
    await query(db, "SELECT id,status FROM agent_tasks WHERE origin_thread_id=?", [threadId])
  ).filter((task) => !ended.has(task.status));
  const confirmed = await request(
    path + "/confirm",
    {
      workflowId: workflow.id,
      conclusion: workflow.conclusion || data?.conclusion || "本轮已结束",
      taskDecisions: openTasks.map((task) => ({
        taskId: task.id,
        disposition: "retain",
        reason: "随本轮留档",
      })),
      notes: workflow.notes,
      createNextIteration: false,
      // 本 helper 固定 createNextIteration:false，所以承接迭代只能给空壳：
      // 服务端在 false 时不允许出现待办或背景事项。
      nextIteration: {
        title: workflow.nextIteration?.title || "",
        background: "",
        goal: workflow.nextIteration?.goal || "",
        items: [],
      },
    },
    credential,
  );
  if (confirmed.status !== 200) return confirmed;
  const [archived] = await query(db, "SELECT archive_snapshot FROM threads WHERE id=?", [threadId]);
  return {
    ...confirmed,
    body:
      typeof archived.archive_snapshot === "string"
        ? JSON.parse(archived.archive_snapshot)
        : archived.archive_snapshot,
  };
}
