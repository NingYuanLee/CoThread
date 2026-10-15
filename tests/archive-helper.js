import { query } from "../server/db.js";
import { processNextProjectMemory } from "../server/project-memory.js";

// Legacy integration scenarios exercise the final archived state. Complete both
// stages explicitly; iteration-archive.test.js tests the individual HTTP stages.
export async function completeArchiveRequest(db, request, path, data, credential) {
  const begun = await request(path, data, credential);
  if (begun.status !== 200 || begun.body.status !== "archiving") return begun;
  const threadId = path.split("/")[2];
  const [thread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);
  let workflow;
  for (let attempt = 0; attempt < 20; attempt++) {
    workflow = (await request(path, undefined, credential)).body;
    if (workflow.status === "ready") break;
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
  }
  const confirmed = await request(
    path + "/confirm",
    {
      workflowId: workflow.id,
      conclusion: workflow.conclusion,
      taskDecisions: workflow.taskDecisions,
      notes: workflow.notes,
      createNextIteration: false,
      nextIteration: workflow.nextIteration,
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
