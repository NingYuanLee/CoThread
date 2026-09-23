import { processNextDocumentOrganization } from "./document-organization-run.js";
import { processNextProjectMemory } from "./project-memory.js";
import { processNextL1ContextCompression } from "./l1-context.js";
import { processNextL3ContextCompression } from "./l3-context.js";
import { query } from "./db.js";
import { HttpError } from "./service.js";

export function assertMemoryMaintenanceAuth(authorizationHeader) {
  const configured = process.env.MEMORY_MAINTENANCE_TOKEN;
  const supplied = authorizationHeader || "";
  if (!configured || supplied !== `Bearer ${configured}`)
    throw new HttpError(401, "知识库维护凭据无效");
}

/** Requeue L1 runs left running after a killed cloud-function / agent request. */
export async function recoverStaleL1Runs(db, { olderThanMinutes = 10 } = {}) {
  const result = await query(db, `UPDATE agent_l1_runs
    SET status='queued',started_at=NULL,error='维护超时中断，将自动重试。'
    WHERE status='running' AND started_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)`,
  [olderThanMinutes]);
  return Number(result?.affectedRows || 0);
}

/** Drain up to maxBatches of L1 / organization / compaction work. Used by cron and manual kicks. */
export async function runMemoryMaintenance(db, { maxBatches = 25, projectId = null, task = null } = {}) {
  await recoverStaleL1Runs(db);
  let processed = 0;
  while (processed < maxBatches) {
    let worked = false;
    if (projectId || task) {
      worked = await processNextProjectMemory(db, {
        projectId: projectId || undefined,
        task: task || undefined,
      });
    } else {
      worked = await processNextDocumentOrganization(db)
        || await processNextProjectMemory(db)
        || await processNextL1ContextCompression(db)
        || await processNextL3ContextCompression(db);
    }
    if (!worked) break;
    processed++;
  }
  return { status: "ok", processed };
}
