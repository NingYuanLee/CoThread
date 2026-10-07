import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import {
  computeMiniprogramPathHash,
  computeMiniprogramSourceHash,
  miniprogramSnapshot,
} from "./miniprogram-workspace.js";

/**
 * 小程序发布审批流。
 *
 * 核心不变量：
 *  1. 仅生产发布进入本状态机；微信体验版上传直接执行，不属于生产发布。
 *  2. 批准时绑定的源码哈希，执行前必须复核；不一致即 expired，防止「批准 A、上传 B」。
 *  3. 批准是 CAS 转换（pending→executing），因此重复点击不会重复上传。
 *  4. 失败不自动重试；拿旧批准反复打生产比失败本身更糟。
 */

export const RELEASE_TARGETS = ["wechat_upload", "cloudbase_static", "cloudbase_function"];
export const RELEASE_STATUSES = [
  "pending",
  "approved",
  "executing",
  "succeeded",
  "failed",
  "rejected",
  "cancelled",
  "expired",
];
function positiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const RELEASE_EXPIRY_HOURS = positiveIntEnv("MINIPROGRAM_RELEASE_EXPIRY_HOURS", 24);
/** A request stuck in `executing` this long is treated as interrupted. */
export const RELEASE_STUCK_MINUTES = positiveIntEnv("MINIPROGRAM_RELEASE_STUCK_MINUTES", 30);

export const RELEASE_TARGET_LABELS = {
  wechat_upload: "微信上传",
  cloudbase_static: "Admin 静态托管",
  cloudbase_function: "服务端云函数",
};

const TARGET = z.enum(RELEASE_TARGETS);
const FORMAL_TARGET = z.enum(["cloudbase_static", "cloudbase_function"]);

function releaseSourceHash(snapshot, target, resourceName = null) {
  if (target === "cloudbase_function") {
    return resourceName
      ? computeMiniprogramPathHash(snapshot.areas.miniprogram_server?.files || [], resourceName)
      : null;
  }
  if (target === "cloudbase_static") {
    return computeMiniprogramSourceHash(snapshot.areas.miniprogram_admin?.files || []);
  }
  return snapshot.sourceHash;
}

export function releaseStatusLabel(status) {
  return (
    {
      pending: "待审批",
      approved: "已批准",
      executing: "执行中",
      succeeded: "已发布",
      failed: "失败",
      rejected: "已拒绝",
      cancelled: "已撤回",
      expired: "已过期",
    }[status] || status
  );
}

function publicRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.batch_id || row.id,
    target: row.target,
    targetLabel: RELEASE_TARGET_LABELS[row.target] || row.target,
    // Empty means the target resolves its own environment; Admin static hosting is production.
    environment: row.environment || null,
    version: row.version || null,
    resourceName: row.resource_name || null,
    releaseNote: row.release_note || null,
    sourceHash: row.source_hash,
    status: row.status,
    statusLabel: releaseStatusLabel(row.status),
    requestedBy: row.requested_by,
    requestedByKind: row.requested_by_kind,
    decidedBy: row.decided_by || null,
    decidedAt: row.decided_at || null,
    decisionNote: row.decision_note || null,
    deploymentId: row.deployment_id || null,
    attemptCount: Number(row.attempt_count) || 0,
    lastError: row.last_error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function applicationStatus(rows) {
  const statuses = new Set(rows.map((row) => row.status));
  if (statuses.size === 1) return rows[0]?.status || "pending";
  if (statuses.has("executing") || statuses.has("approved")) return "executing";
  if (statuses.has("pending")) return "pending";
  if (statuses.has("succeeded") && statuses.has("failed")) return "partial";
  if (statuses.has("failed")) return "failed";
  if (statuses.has("expired")) return "expired";
  if (statuses.has("rejected")) return "rejected";
  if (statuses.has("cancelled")) return "cancelled";
  return rows[0]?.status || "pending";
}

function publicApplication(rows, snapshot = null) {
  if (!rows.length) return null;
  const items = rows.map(publicRow);
  const first = items[0];
  const status = applicationStatus(rows);
  const sourceChanged = snapshot
    ? rows.some(
        (row) => row.source_hash !== releaseSourceHash(snapshot, row.target, row.resource_name),
      )
    : false;
  return {
    id: first.applicationId,
    status,
    statusLabel: status === "partial" ? "部分成功" : releaseStatusLabel(status),
    requestedBy: first.requestedBy,
    requestedByKind: first.requestedByKind,
    releaseNote: first.releaseNote,
    decidedBy: first.decidedBy,
    decidedAt: first.decidedAt,
    decisionNote: first.decisionNote,
    createdAt: first.createdAt,
    updatedAt: items.reduce(
      (latest, item) =>
        !latest || (item.updatedAt && item.updatedAt > latest) ? item.updatedAt : latest,
      null,
    ),
    sourceChanged,
    items,
  };
}

async function readApplicationRows(db, projectId, applicationId) {
  return query(
    db,
    `SELECT * FROM miniprogram_release_requests
     WHERE project_id=? AND (batch_id=? OR (batch_id IS NULL AND id=?))
     ORDER BY created_at,id`,
    [projectId, applicationId, applicationId],
  );
}

async function readRow(db, requestId) {
  const [row] = await query(db, "SELECT * FROM miniprogram_release_requests WHERE id=?", [
    requestId,
  ]);
  return row || null;
}

/**
 * Lazily expire stale requests and mark interrupted executions. Runs on read so
 * the flow does not depend on a scheduler being alive.
 */
export async function sweepReleaseRequests(db, projectId = null) {
  const scope = projectId ? "AND project_id=?" : "";
  const args = projectId ? [projectId] : [];
  const expired = await query(
    db,
    `UPDATE miniprogram_release_requests
     SET status='expired', decision_note=COALESCE(decision_note,'超过有效期自动过期')
     WHERE status='pending' ${scope}
       AND created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${RELEASE_EXPIRY_HOURS} HOUR)`,
    args,
  );
  const interrupted = await query(
    db,
    `UPDATE miniprogram_release_requests
     SET status='failed', last_error=COALESCE(last_error,'执行中断，可能已上传成功，请到目标平台核实')
     WHERE status IN ('approved','executing') ${scope}
       AND updated_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${RELEASE_STUCK_MINUTES} MINUTE)`,
    args,
  );
  return {
    expired: Number(expired?.affectedRows) || 0,
    interrupted: Number(interrupted?.affectedRows) || 0,
  };
}

/** Submit a release request. Nothing is published here. */
export async function submitReleaseRequest(service, actor, projectId, input = {}) {
  await service.member(actor, projectId, false);
  const data = z
    .object({
      target: TARGET,
      // Not defaulted to "production": an unspecified environment must resolve to the
      // publish target's own configuration, otherwise every default submit fails with
      // "生产环境未配置" even when the target only ever deploys to development.
      environment: z.string().trim().max(32).nullable().optional(),
      version: z.string().trim().max(64).nullable().optional(),
      resourceName: z.string().trim().max(64).nullable().optional(),
      releaseNote: z.string().trim().max(512).nullable().optional(),
    })
    .parse(input || {});

  if (data.target === "wechat_upload" && !data.version) {
    throw new HttpError(400, "上传微信版本必须填写版本号");
  }
  if (data.target === "cloudbase_function" && !data.resourceName) {
    throw new HttpError(400, "发布服务端云函数必须指定函数名称");
  }
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const sourceHash = releaseSourceHash(snapshot, data.target, data.resourceName);
  if (!sourceHash) throw new HttpError(409, "对应发布区域的源码为空，无法申请发布");

  await sweepReleaseRequests(service.db, projectId);
  return transaction(service.db, async (conn) => {
    const [existing] = await query(
      conn,
      `SELECT id FROM miniprogram_release_requests
       WHERE project_id=? AND target=? AND COALESCE(resource_name,'')=?
         AND status IN ('pending','approved','executing')
       LIMIT 1 FOR UPDATE`,
      [projectId, data.target, data.resourceName || ""],
    );
    if (existing) {
      throw new HttpError(409, `该目标已有未完成的发布申请（${existing.id}），请先处理`);
    }
    const id = randomUUID();
    await query(
      conn,
      `INSERT INTO miniprogram_release_requests
         (id,project_id,target,environment,version,resource_name,release_note,source_hash,status,
          requested_by,requested_by_kind,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,'pending',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [
        id,
        projectId,
        data.target,
        // Column is NOT NULL; empty string encodes "unspecified".
        data.target === "cloudbase_static" ? "production" : data.environment || "",
        data.version || null,
        data.resourceName || null,
        data.releaseNote || null,
        sourceHash,
        actor.id,
        actor.kind === "session" ? "session" : "agent",
      ],
    );
    return publicRow(await readRow(conn, id));
  });
}

export async function listReleaseRequests(service, user, projectId, { limit = 30 } = {}) {
  await service.member(user, projectId, false);
  await sweepReleaseRequests(service.db, projectId);
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const rows = await query(
    service.db,
    `SELECT * FROM miniprogram_release_requests WHERE project_id=?
     ORDER BY created_at DESC LIMIT ${size}`,
    [projectId],
  );
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const pending = rows.filter((row) => row.status === "pending");
  return {
    requests: rows.map(publicRow),
    pendingCount: pending.length,
    // A pending request whose bound hash no longer matches can no longer be approved.
    currentSourceHash: snapshot.sourceHash,
    sourceChanged:
      pending.length > 0 &&
      pending.some(
        (row) => row.source_hash !== releaseSourceHash(snapshot, row.target, row.resource_name),
      ),
  };
}

export async function readReleaseRequest(service, user, projectId, requestId) {
  await service.member(user, projectId, false);
  await sweepReleaseRequests(service.db, projectId);
  const row = await readRow(service.db, requestId);
  if (!row || row.project_id !== projectId) throw new HttpError(404, "发布申请不存在");
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  return {
    ...publicRow(row),
    sourceMatches: row.source_hash === releaseSourceHash(snapshot, row.target, row.resource_name),
    currentSourceHash: releaseSourceHash(snapshot, row.target, row.resource_name),
  };
}

/**
 * Approve and execute. `execute(request)` performs the actual release and
 * returns the deployment id; it is injected so the state machine is testable
 * without touching WeChat or CloudBase.
 */
export async function approveReleaseRequest(service, actor, projectId, requestId, options = {}) {
  // ownerOnly: 批准只能是项目负责人。
  await service.member(actor, projectId, true, service.db, true);
  const data = z
    .object({ note: z.string().trim().max(512).nullable().optional() })
    .parse(options || {});
  const execute = options.execute;
  if (typeof execute !== "function") throw new HttpError(500, "缺少发布执行入口");

  await sweepReleaseRequests(service.db, projectId);
  const row = await readRow(service.db, requestId);
  if (!row || row.project_id !== projectId) throw new HttpError(404, "发布申请不存在");
  if (row.status !== "pending") {
    throw new HttpError(409, `申请当前状态为「${releaseStatusLabel(row.status)}」，无法批准`);
  }

  // 源码必须仍是提交时的那一份。
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  if (releaseSourceHash(snapshot, row.target, row.resource_name) !== row.source_hash) {
    await query(
      service.db,
      `UPDATE miniprogram_release_requests SET status='expired',decision_note=?
       WHERE id=? AND status='pending'`,
      ["源码在申请后发生变更，已作废，请重新提交", requestId],
    );
    throw new HttpError(409, "源码在申请后发生变更，该申请已作废，请重新提交");
  }

  // CAS：只有把 pending 推进成 executing 的这一次调用才真正执行。
  const claimed = await query(
    service.db,
    `UPDATE miniprogram_release_requests
     SET status='executing',decided_by=?,decided_at=UTC_TIMESTAMP(3),decision_note=?,attempt_count=attempt_count+1
     WHERE id=? AND project_id=? AND status='pending'`,
    [actor.id, data.note || null, requestId, projectId],
  );
  if (!Number(claimed?.affectedRows)) {
    throw new HttpError(409, "该申请已被处理，请刷新后重试");
  }

  try {
    const deploymentId = await execute(publicRow(row));
    await query(
      service.db,
      `UPDATE miniprogram_release_requests SET status='succeeded',deployment_id=?,last_error=NULL WHERE id=?`,
      [deploymentId || null, requestId],
    );
    return publicRow(await readRow(service.db, requestId));
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 512);
    await query(
      service.db,
      `UPDATE miniprogram_release_requests SET status='failed',last_error=? WHERE id=?`,
      [detail, requestId],
    );
    throw error;
  }
}

export async function rejectReleaseRequest(service, actor, projectId, requestId, options = {}) {
  await service.member(actor, projectId, true, service.db, true);
  const data = z.object({ reason: z.string().trim().max(512).optional() }).parse(options || {});
  const row = await readRow(service.db, requestId);
  if (!row || row.project_id !== projectId) throw new HttpError(404, "发布申请不存在");
  if (row.status !== "pending") {
    throw new HttpError(409, `申请当前状态为「${releaseStatusLabel(row.status)}」，无法拒绝`);
  }
  await query(
    service.db,
    `UPDATE miniprogram_release_requests
     SET status='rejected',decided_by=?,decided_at=UTC_TIMESTAMP(3),decision_note=?
     WHERE id=? AND status='pending'`,
    [actor.id, data.reason || "未填写理由", requestId],
  );
  return publicRow(await readRow(service.db, requestId));
}

/** Only the requester may withdraw their own pending request. */
export async function cancelReleaseRequest(service, actor, projectId, requestId) {
  await service.member(actor, projectId, false);
  const row = await readRow(service.db, requestId);
  if (!row || row.project_id !== projectId) throw new HttpError(404, "发布申请不存在");
  if (row.requested_by !== actor.id) throw new HttpError(403, "只能撤回自己提交的申请");
  if (row.status !== "pending") {
    throw new HttpError(409, `申请当前状态为「${releaseStatusLabel(row.status)}」，无法撤回`);
  }
  await query(
    service.db,
    `UPDATE miniprogram_release_requests SET status='cancelled',decision_note='申请人撤回'
     WHERE id=? AND status='pending'`,
    [requestId],
  );
  return publicRow(await readRow(service.db, requestId));
}

/** Submit one formal-release application containing one or more independently tracked targets. */
export async function submitReleaseApplication(service, actor, projectId, input = {}) {
  await service.member(actor, projectId, false);
  const data = z
    .object({
      items: z
        .array(
          z.object({
            target: FORMAL_TARGET,
            resourceName: z.string().trim().max(64).nullable().optional(),
          }),
        )
        .min(1)
        .max(100),
      environment: z.string().trim().max(32).default("production"),
      releaseNote: z.string().trim().max(512).nullable().optional(),
    })
    .parse(input || {});
  const seen = new Set();
  for (const item of data.items) {
    if (item.target === "cloudbase_function" && !item.resourceName) {
      throw new HttpError(400, "发布服务端云函数必须指定函数名称");
    }
    if (item.target !== "cloudbase_function" && item.resourceName) {
      throw new HttpError(400, "Admin 生产版不能指定资源名称");
    }
    const key = `${item.target}:${item.resourceName || ""}`;
    if (seen.has(key)) throw new HttpError(400, "同一发布申请不能重复选择目标");
    seen.add(key);
  }

  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const prepared = data.items.map((item) => {
    const sourceHash = releaseSourceHash(snapshot, item.target, item.resourceName);
    if (!sourceHash) throw new HttpError(409, "对应发布区域的源码为空，无法申请发布");
    return { ...item, sourceHash };
  });
  await sweepReleaseRequests(service.db, projectId);

  const applicationId = randomUUID();
  await transaction(service.db, async (conn) => {
    for (const item of prepared) {
      const [existing] = await query(
        conn,
        `SELECT id FROM miniprogram_release_requests
         WHERE project_id=? AND target=? AND COALESCE(resource_name,'')=?
           AND status IN ('pending','approved','executing')
         LIMIT 1 FOR UPDATE`,
        [projectId, item.target, item.resourceName || ""],
      );
      if (existing) throw new HttpError(409, "选中的目标已有未完成的发布申请，请先处理");
    }
    for (const item of prepared) {
      await query(
        conn,
        `INSERT INTO miniprogram_release_requests
           (id,batch_id,project_id,target,environment,version,resource_name,release_note,source_hash,status,
            requested_by,requested_by_kind,created_at,updated_at)
         VALUES(?,?,?,?,?,NULL,?,?,?,'pending',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
        [
          randomUUID(),
          applicationId,
          projectId,
          item.target,
          item.target === "cloudbase_static" ? "production" : data.environment,
          item.resourceName || null,
          data.releaseNote || null,
          item.sourceHash,
          actor.id,
          actor.kind === "session" ? "session" : "agent",
        ],
      );
    }
  });
  return publicApplication(
    await readApplicationRows(service.db, projectId, applicationId),
    snapshot,
  );
}

export async function listReleaseApplications(service, actor, projectId, { limit = 30 } = {}) {
  await service.member(actor, projectId, false);
  await sweepReleaseRequests(service.db, projectId);
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const rows = await query(
    service.db,
    `SELECT * FROM miniprogram_release_requests
     WHERE project_id=? AND target<>'wechat_upload'
     ORDER BY created_at DESC LIMIT ${size * 20}`,
    [projectId],
  );
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const groups = new Map();
  for (const row of rows) {
    const id = row.batch_id || row.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const applications = [...groups.values()]
    .slice(0, size)
    .map((group) => publicApplication(group, snapshot));
  return {
    applications,
    pendingCount: applications.filter((item) => item.status === "pending").length,
  };
}

export async function approveReleaseApplication(
  service,
  actor,
  projectId,
  applicationId,
  options = {},
) {
  await service.member(actor, projectId, true, service.db, true);
  const data = z
    .object({ note: z.string().trim().max(512).nullable().optional() })
    .parse(options || {});
  const execute = options.execute;
  if (typeof execute !== "function") throw new HttpError(500, "缺少发布执行入口");
  await sweepReleaseRequests(service.db, projectId);
  let rows = await readApplicationRows(service.db, projectId, applicationId);
  if (!rows.length) throw new HttpError(404, "发布申请不存在");
  if (rows.some((row) => row.status !== "pending")) {
    throw new HttpError(409, "该发布申请已被处理，请刷新后重试");
  }
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  if (
    rows.some(
      (row) => releaseSourceHash(snapshot, row.target, row.resource_name) !== row.source_hash,
    )
  ) {
    await query(
      service.db,
      `UPDATE miniprogram_release_requests
       SET status='expired',decision_note='源码在申请后发生变更，已作废，请重新提交'
       WHERE id IN (${rows.map(() => "?").join(",")}) AND status='pending'`,
      rows.map((row) => row.id),
    );
    throw new HttpError(409, "源码在申请后发生变更，该申请已作废，请重新提交");
  }
  await transaction(service.db, async (conn) => {
    for (const row of rows) {
      const claimed = await query(
        conn,
        `UPDATE miniprogram_release_requests
         SET status='executing',decided_by=?,decided_at=UTC_TIMESTAMP(3),decision_note=?,
             attempt_count=attempt_count+1
         WHERE id=? AND status='pending'`,
        [actor.id, data.note || null, row.id],
      );
      if (!Number(claimed?.affectedRows))
        throw new HttpError(409, "该发布申请已被处理，请刷新后重试");
    }
  });
  for (const row of rows) {
    try {
      const deploymentId = await execute(publicRow(row));
      await query(
        service.db,
        `UPDATE miniprogram_release_requests SET status='succeeded',deployment_id=?,last_error=NULL WHERE id=?`,
        [deploymentId || null, row.id],
      );
    } catch (error) {
      await query(
        service.db,
        `UPDATE miniprogram_release_requests SET status='failed',last_error=? WHERE id=?`,
        [String(error?.message || error).slice(0, 512), row.id],
      );
    }
  }
  rows = await readApplicationRows(service.db, projectId, applicationId);
  return publicApplication(rows, snapshot);
}

export async function rejectReleaseApplication(
  service,
  actor,
  projectId,
  applicationId,
  options = {},
) {
  await service.member(actor, projectId, true, service.db, true);
  const data = z.object({ reason: z.string().trim().min(1).max(512) }).parse(options || {});
  const rows = await readApplicationRows(service.db, projectId, applicationId);
  if (!rows.length) throw new HttpError(404, "发布申请不存在");
  if (rows.some((row) => row.status !== "pending")) throw new HttpError(409, "该发布申请已被处理");
  await query(
    service.db,
    `UPDATE miniprogram_release_requests
     SET status='rejected',decided_by=?,decided_at=UTC_TIMESTAMP(3),decision_note=?
     WHERE id IN (${rows.map(() => "?").join(",")}) AND status='pending'`,
    [actor.id, data.reason, ...rows.map((row) => row.id)],
  );
  return publicApplication(await readApplicationRows(service.db, projectId, applicationId));
}

export async function cancelReleaseApplication(service, actor, projectId, applicationId) {
  await service.member(actor, projectId, false);
  const rows = await readApplicationRows(service.db, projectId, applicationId);
  if (!rows.length) throw new HttpError(404, "发布申请不存在");
  if (rows.some((row) => row.requested_by !== actor.id))
    throw new HttpError(403, "只能撤回自己提交的申请");
  if (rows.some((row) => row.status !== "pending")) throw new HttpError(409, "该发布申请已被处理");
  await query(
    service.db,
    `UPDATE miniprogram_release_requests SET status='cancelled',decision_note='申请人撤回'
     WHERE id IN (${rows.map(() => "?").join(",")}) AND status='pending'`,
    rows.map((row) => row.id),
  );
  return publicApplication(await readApplicationRows(service.db, projectId, applicationId));
}
