import { processNextProjectMemory } from "./project-memory.js";
import { processNextLaowengContextCompression } from "./laoweng-context.js";
import { processNextChildContextCompression } from "./child-agent-context.js";
import { query } from "./db.js";
import {
  closeStaleFileIndexScanBatches,
  discoverNextFileIndexChange,
  expandFileIndexProjectReconciliation,
  reconcileNextFileIndexArtifact,
  scheduleNextFileIndexSweep,
} from "./file-index-discovery.js";
import { HttpError } from "./service.js";
import {
  backfillProjectMemory,
  claimProjectMemoryBackfill,
  completeProjectMemoryBackfill,
} from "./memory-backfill.js";

export function assertMemoryMaintenanceAuth(authorizationHeader) {
  const configured = process.env.MEMORY_MAINTENANCE_TOKEN;
  const supplied = authorizationHeader || "";
  if (!configured || supplied !== `Bearer ${configured}`)
    throw new HttpError(401, "记忆维护凭据无效");
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
  let backfillAttempted = false;
  while (processed < maxBatches) {
    let worked = false;
    if (!projectId && !task && !backfillAttempted) {
      backfillAttempted = true;
      const backfillProjectId = await claimProjectMemoryBackfill(db);
      if (backfillProjectId) {
        try {
          await backfillProjectMemory(db, { projectId: backfillProjectId });
          await completeProjectMemoryBackfill(db, backfillProjectId);
        } catch (error) {
          await completeProjectMemoryBackfill(db, backfillProjectId, error);
        }
        worked = true;
      }
    }
    if (!projectId && !task && !worked) {
      worked =
        (await discoverNextFileIndexChange(db)) ||
        (await expandFileIndexProjectReconciliation(db)) ||
        (await reconcileNextFileIndexArtifact(db)) ||
        (await scheduleNextFileIndexSweep(db)) ||
        (await closeStaleFileIndexScanBatches(db)) > 0;
    }
    if (projectId || task) {
      worked ||= await processNextProjectMemory(db, {
        projectId: projectId || undefined,
        task: task || undefined,
      });
    } else {
      worked ||=
        (await processNextProjectMemory(db)) ||
        (await processNextLaowengContextCompression(db)) ||
        (await processNextChildContextCompression(db));
    }
    if (!worked) break;
    processed++;
  }
  return { status: "ok", processed };
}
