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
import { scanNextProjectMemoryProject, scanProjectMemorySignals } from "./project-memory-scan.js";

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
  // 先清掉来源已删除的文档信号：它们不会自愈，留着会让结算反复失败并常驻面板。
  const { dropUnavailableDocumentVersionSignals } = await import("./project-memory.js");
  await dropUnavailableDocumentVersionSignals(db, { projectId: projectId || null });
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
    // 项目进程信号不再由业务事件写入：先按项目游标扫描增量事实（新项目只建水位），
    // 再交给结算消费。手动运行只扫指定项目，自动维护每轮挑一个到期项目。
    if (projectId) {
      if (processed === 0) await scanProjectMemorySignals(db, projectId);
    } else if (!task && !worked) {
      worked = await scanNextProjectMemoryProject(db);
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
