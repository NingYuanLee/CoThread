import { processNextProjectMemory } from "./project-memory.js";
import { processNextLaowengContextCompression } from "./laoweng-context.js";
import { processNextChildContextCompression } from "./child-agent-context.js";
import { query } from "./db.js";
import { HttpError } from "./service.js";

export function assertMemoryMaintenanceAuth(authorizationHeader) {
  const configured = process.env.MEMORY_MAINTENANCE_TOKEN;
  const supplied = authorizationHeader || "";
  if (!configured || supplied !== `Bearer ${configured}`)
    throw new HttpError(401, "知识库维护凭据无效");
}

/** Requeue 老翁 runs left running after a killed cloud-function / agent request. */
export async function recoverStaleLaowengRuns(db, { olderThanMinutes = 10 } = {}) {
  const result = await query(
    db,
    `UPDATE agent_laoweng_runs
    SET status='queued',started_at=NULL,error='维护超时中断，将自动重试。'
    WHERE status='running' AND started_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)`,
    [olderThanMinutes],
  );
  return Number(result?.affectedRows || 0);
}

/** Drain up to maxBatches of 老翁 / compaction work. Used by cron and manual kicks. */
export async function runMemoryMaintenance(
  db,
  { maxBatches = 25, projectId = null, task = null } = {},
) {
  await recoverStaleLaowengRuns(db);
  let processed = 0;
  while (processed < maxBatches) {
    let worked = false;
    if (projectId || task) {
      worked = await processNextProjectMemory(db, {
        projectId: projectId || undefined,
        task: task || undefined,
      });
    } else {
      worked =
        (await processNextProjectMemory(db)) ||
        (await processNextLaowengContextCompression(db)) ||
        (await processNextChildContextCompression(db));
    }
    if (!worked) break;
    processed++;
  }
  return { status: "ok", processed };
}
