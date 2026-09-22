import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { accountCredential, accountCredentialVersion, digest } from "./auth.js";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { reopenConnectorTask, syncConnectorTaskById } from "./agent-task-sync.js";
import { mentionTaskSourceNotice } from "./task-source-notice.js";

const pairingCode = () => randomBytes(9).toString("base64url").toUpperCase();
const bearer = (req) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
const connectorToken = () => `ctc_${randomBytes(32).toString("base64url")}`;
const queryText = (value, max) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text ? text.slice(0, max) : null;
};
async function device(db, req) {
  const token = bearer(req);
  if (!token?.startsWith("ctc_")) throw new HttpError(401, "本地执行器凭证无效");
  const [row] = await query(db, `SELECT c.*,u.disabled_at FROM connectors c JOIN users u ON u.id=c.user_id
    WHERE c.token_hash=? AND c.revoked_at IS NULL`, [digest(token)]);
  if (!row || row.disabled_at) throw new HttpError(401, "本地执行器凭证无效或已撤销");
  return row;
}

async function connectorAgentTask(conn, connectorTask) {
  if (connectorTask.agent_task_id) {
    const [row] = await query(conn, "SELECT * FROM agent_tasks WHERE id=?", [connectorTask.agent_task_id]);
    if (row) return row;
  }
  return {
    id: connectorTask.agent_task_id || connectorTask.id,
    origin_thread_id: connectorTask.thread_id,
    source_user_id: connectorTask.requested_by,
    project_id: connectorTask.project_id,
    title: "",
  };
}

async function reportConnectorToSource(service, conn, connectorTask, body) {
  const agentTask = await connectorAgentTask(conn, connectorTask);
  return mentionTaskSourceNotice(service, conn, { id: connectorTask.assigned_to, kind: "api" }, agentTask, body, {
    source: "local_ai",
  });
}

async function replaceAccountConnector(conn, userId, data, token) {
  await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
  const deviceId = data.deviceId || data.device_id || null;
  const [existing] = await query(conn, `SELECT id,user_id FROM connectors
    WHERE (? IS NOT NULL AND device_id=?) OR (? IS NULL AND user_id=?)
    ORDER BY CASE WHEN device_id=? THEN 0 ELSE 1 END,created_at LIMIT 1 FOR UPDATE`,
  [deviceId, deviceId, deviceId, userId, deviceId]);
  const [memberConnector] = await query(conn, "SELECT id FROM connectors WHERE user_id=? AND revoked_at IS NULL FOR UPDATE", [userId]);
  if (memberConnector && (!existing || memberConnector.id !== existing.id)) {
    await query(conn, `UPDATE connectors SET revoked_at=UTC_TIMESTAMP(3),token_hash=SHA2(CONCAT(token_hash,UUID()),256)
      WHERE id=?`, [memberConnector.id]);
    await query(conn, `UPDATE connector_bindings SET active=NULL,unbound_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND active=1`, [memberConnector.id]);
  }
  if (existing) {
    await query(conn, `UPDATE connector_tasks SET status='cancelled',error='账号已在另一台电脑重新连接',finished_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND status IN ('awaiting_approval','queued','running','paused')`, [existing.id]);
    const cancelled = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND status='cancelled' AND error=?", [existing.id, "账号已在另一台电脑重新连接"]);
    for (const task of cancelled) await syncConnectorTaskById(conn, task.id);
    // 账号仍是同一连接器身份：保留已绑定项目，否则重试后领取会因缺少 connector_projects 失败，
    // 轮询还会把刚重新排队的任务标成「失去项目执行权限」。本机目录仍由连接器本地配置决定。
    await query(conn, `UPDATE connectors SET user_id=?,device_id=COALESCE(?,device_id),name=?,platform=?,version=?,token_hash=?,last_seen_at=UTC_TIMESTAMP(3),revoked_at=NULL
      WHERE id=?`, [userId, deviceId, data.name, data.platform, data.version, digest(token), existing.id]);
    await query(conn, `UPDATE connector_bindings SET active=NULL,unbound_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND active=1`, [existing.id]);
    await query(conn, `INSERT INTO connector_bindings(id,connector_id,member_id,active)
      VALUES(UUID(),?,?,1)`, [existing.id, userId]);
    return existing.id;
  }
  const id = randomUUID();
  await query(conn, `INSERT INTO connectors(id,user_id,device_id,name,platform,version,token_hash,last_seen_at)
    VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [id, userId, deviceId || id, data.name, data.platform, data.version, digest(token)]);
  await query(conn, `INSERT INTO connector_bindings(id,connector_id,member_id,active) VALUES(UUID(),?,?,1)`, [id, userId]);
  return id;
}

export async function connectorTool(service, user, name, input, job, thread) {
  if (name !== "list_local_connectors") throw new HttpError(400, "未知本地执行器工具");
  return query(service.db, `SELECT c.id,c.name,c.platform,c.version,cp.policy,cp.allow_git_push allowGitPush,u.id owner_id,u.name owner_name,
    c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) online
    FROM connectors c JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
    JOIN members m ON m.project_id=cp.project_id AND m.user_id=c.user_id
    JOIN users u ON u.id=c.user_id
    WHERE m.role<>'viewer' AND c.revoked_at IS NULL
    ORDER BY online DESC,u.name,c.last_seen_at DESC,c.created_at DESC`, [thread.project_id]);
}

export function registerConnectorPublicRoutes(app, db, service, { makers = false } = {}) {
  app.post(["/api/connector/authorizations", "/api/connector/v2/authorizations"], async (req, res) => {
    const data = z.object({
      name: z.string().trim().min(1).max(100),
      deviceId: z.string().uuid().optional(),
      platform: z.string().trim().min(1).max(40).default("windows"),
      version: z.string().trim().min(1).max(40),
    }).parse(req.body);
    const id = randomUUID();
    const pollToken = randomBytes(32).toString("base64url");
    await query(db, "DELETE FROM connector_authorizations WHERE UNIX_TIMESTAMP(expires_at)<UNIX_TIMESTAMP()");
    await query(db, `INSERT INTO connector_authorizations(id,poll_token_hash,device_id,name,platform,version,expires_at)
      VALUES(?,?,?,?,?,?,FROM_UNIXTIME(UNIX_TIMESTAMP()+600))`,
    [id, digest(pollToken), data.deviceId || null, data.name, data.platform, data.version]);
    const origin = process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
    const verificationUrl = new URL("/", origin);
    verificationUrl.searchParams.set("connectorAuthorization", id);
    res.status(201).json({ protocol: 2, delivery: "localhost", id, pollToken,
      verificationUrl: verificationUrl.toString(), expiresIn: 600 });
  });

  app.post(["/api/connector/authorizations/:id/poll", "/api/connector/v2/authorizations/:id/poll"], async (req, res) => {
    const authorizationId = z.string().uuid().parse(req.params.id);
    const data = z.object({ pollToken: z.string().min(30).max(100) }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [authorization] = await query(conn, `SELECT *,UNIX_TIMESTAMP(expires_at)>UNIX_TIMESTAMP() valid
        FROM connector_authorizations WHERE id=? FOR UPDATE`, [authorizationId]);
      if (!authorization) throw new HttpError(404, "授权请求尚未同步或不存在");
      if (authorization.poll_token_hash !== digest(data.pollToken))
        throw new HttpError(401, "授权请求凭证不匹配");
      if (Number(authorization.valid) !== 1)
        throw new HttpError(410, "网页登录授权已过期，请重新发起");
      if (authorization.denied_at) throw new HttpError(403, "用户已拒绝本地执行器授权");
      if (authorization.consumed_at) throw new HttpError(409, "授权结果已经领取");
      if (!authorization.approved_at || !authorization.user_id) return { status: "pending" };
      const token = connectorToken();
      const connectorId = await replaceAccountConnector(conn, authorization.user_id, authorization, token);
      await query(conn, "UPDATE connector_authorizations SET consumed_at=CURRENT_TIMESTAMP(3) WHERE id=?", [authorization.id]);
      return { status: "approved", id: connectorId, token };
    });
    res.status(result.status === "pending" ? 202 : 200).json(result);
  });

  app.post("/api/connector/pair", async (req, res) => {
    const data = z.object({
      code: z.string().trim().min(10).max(32).transform((value) => value.toUpperCase()),
      deviceId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(100),
      platform: z.string().trim().min(1).max(40).default("windows"),
      version: z.string().trim().min(1).max(40),
    }).parse(req.body);
    const token = connectorToken();
    const result = await transaction(db, async (conn) => {
      const [pairing] = await query(conn, `SELECT *,expires_at>UTC_TIMESTAMP(3) valid
        FROM connector_pairings WHERE code_hash=? FOR UPDATE`, [digest(data.code)]);
      if (!pairing || pairing.consumed_at || Number(pairing.valid) !== 1)
        throw new HttpError(400, "配对码无效或已过期");
      await query(conn, "UPDATE connector_pairings SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?", [pairing.id]);
      const id = await replaceAccountConnector(conn, pairing.user_id, data, token);
      return { id, token };
    });
    res.status(201).json(result);
  });

  app.get("/api/connector/projects", async (req, res) => {
    const current = await device(db, req);
    await query(db, `UPDATE connectors SET last_seen_at=UTC_TIMESTAMP(3),
      version=COALESCE(?,version),name=COALESCE(?,name),platform=COALESCE(?,platform) WHERE id=?`,
      [queryText(req.query.version, 40), queryText(req.query.name, 100), queryText(req.query.platform, 40), current.id]);
    const rows = await query(db, `SELECT p.id,p.name,m.role,cp.policy,cp.allow_git_push allowGitPush,
      CASE WHEN cp.connector_id IS NULL THEN 0 ELSE 1 END bound
      FROM members m JOIN projects p ON p.id=m.project_id
      LEFT JOIN connector_projects cp ON cp.project_id=p.id AND cp.connector_id=?
      WHERE m.user_id=? AND p.archived_at IS NULL ORDER BY p.name,p.id`, [current.id, current.user_id]);
    res.json(rows.map((row) => ({ ...row, bound: Number(row.bound) === 1, allowGitPush: Number(row.allowGitPush) === 1 })));
  });

  app.put("/api/connector/projects/:id", async (req, res) => {
    const current = await device(db, req);
    const projectId = z.string().uuid().parse(req.params.id);
    const data = z.object({
      allowGitPush: z.boolean().default(false),
    }).parse(req.body);
    const [membership] = await query(db, "SELECT role FROM members WHERE user_id=? AND project_id=?", [current.user_id, projectId]);
    if (!membership || membership.role === "viewer") throw new HttpError(403, "该账号不能修改此项目");
    await query(db, `INSERT INTO connector_projects(connector_id,project_id,policy,allow_git_push) VALUES(?,?,?,?)
      ON DUPLICATE KEY UPDATE policy=VALUES(policy),allow_git_push=VALUES(allow_git_push)`,
    [current.id, projectId, "unrestricted", data.allowGitPush]);
    res.json({ ok: true, projectId, policy: "unrestricted", allowGitPush: data.allowGitPush });
  });

  app.get("/api/connector/tasks", async (req, res) => {
    const current = await device(db, req);
    await query(db, "UPDATE connectors SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=?", [current.id]);
    res.json(await query(db, `SELECT t.id,t.project_id projectId,p.name projectName,th.title threadTitle,u.name requestedByName,t.instruction target,
      t.status,t.progress,t.agent_kind agentKind,t.created_at receivedAt,t.started_at firstStartedAt,t.updated_at latestAt,t.finished_at finishedAt
      FROM connector_tasks t JOIN projects p ON p.id=t.project_id JOIN threads th ON th.id=t.thread_id
      JOIN users u ON u.id=t.requested_by
      WHERE t.connector_id=? AND t.status<>'awaiting_approval' ORDER BY t.created_at DESC,t.id DESC LIMIT 20`, [current.id]));
  });

  app.post("/api/connector/tasks/:id/claim", async (req, res) => {
    const current = await device(db, req);
    const taskId = z.string().uuid().parse(req.params.id);
    const lease = randomBytes(32).toString("base64url");
    const task = await transaction(db, async (conn) => {
      await query(conn, "SELECT id FROM connectors WHERE id=? FOR UPDATE", [current.id]);
      const taskColumns = `t.id,t.project_id,t.thread_id,t.message_id,t.instruction,t.policy,t.allow_git_push,t.status,t.agent_kind,t.connector_id,t.assigned_to,p.name project_name`;
      // 同一连接器可重新领取租约已过期的 paused 任务（本机会话已关闭、连接器重启后继续）。
      const [resumable] = await query(conn, `SELECT ${taskColumns} FROM connector_tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.id=? AND t.connector_id=? AND t.assigned_to=? AND t.status='paused'
          AND (t.lease_expires_at IS NULL OR t.lease_expires_at<=UTC_TIMESTAMP(3)) FOR UPDATE`,
      [taskId, current.id, current.user_id]);
      if (resumable) {
        await query(conn, `UPDATE connector_tasks SET lease_token_hash=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?`,
          [digest(lease), taskId]);
        return { ...resumable, leaseToken: lease, resumed: true };
      }
      const [active] = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND status IN ('running','paused') LIMIT 1", [current.id]);
      if (active) throw new HttpError(409, "当前本地执行器已有正在执行或暂停的任务");
      const [candidate] = await query(conn, `SELECT ${taskColumns}
        FROM connector_tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.id=? FOR UPDATE`, [taskId]);
      if (!candidate) throw new HttpError(404, "任务不存在");
      if (candidate.connector_id !== current.id || candidate.assigned_to !== current.user_id)
        throw new HttpError(409, "当前本地执行器没有执行权限");
      if (candidate.status !== "queued") throw new HttpError(409, "任务已被处理或当前不是待开始状态");
      const [membership] = await query(conn, "SELECT role FROM members WHERE project_id=? AND user_id=?",
        [candidate.project_id, current.user_id]);
      if (!membership || membership.role === "viewer") throw new HttpError(409, "当前账号没有该项目的执行权限");
      // 任务已派给当前连接器时补齐绑定：本机「已连接」只表示记得仓库路径，重新授权后服务端绑定可能已空。
      await query(conn, `INSERT INTO connector_projects(connector_id,project_id,policy,allow_git_push) VALUES(?,?,?,?)
        ON DUPLICATE KEY UPDATE policy=VALUES(policy)`,
        [current.id, candidate.project_id, candidate.policy || "unrestricted", Number(candidate.allow_git_push) ? 1 : 0]);
      await query(conn, `UPDATE connector_tasks SET status='running',lease_token_hash=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE),
        started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),progress='正在本机准备项目' WHERE id=?`, [digest(lease), taskId]);
      await syncConnectorTaskById(conn, taskId, { publish: true });
      return { ...candidate, status: "running", leaseToken: lease, resumed: false };
    });
    res.json({ task });
  });

  const mcpCredentialResponse = (current, credential) => ({
    token: credential.token,
    expiresAt: credential.expiresAt,
    version: credential.version,
    endpoint: makers ? "/cothread-mcp" : "/mcp",
    conversationId: makers ? current.user_id : null,
  });
  app.post("/api/connector/mcp-credential", async (req, res) => {
    const current = await device(db, req);
    // 仅 ensure（不重置）当前设备所属账号的 MCP 令牌，供连接器自动写入本机 Agent 的 MCP 配置。
    res.json(mcpCredentialResponse(current, await accountCredential(db, current.user_id)));
  });
  app.get("/api/connector/mcp-credential/version", async (req, res) => {
    const current = await device(db, req);
    // 轮询只返回版本元数据；只有版本变化时才下发秘密令牌。
    res.json(await accountCredentialVersion(db, current.user_id));
  });

  app.post("/api/connector/tasks/:id/control", async (req, res) => {
    const current = await device(db, req);
    const taskId = z.string().uuid().parse(req.params.id);
    const { action } = z.object({ action: z.enum(["abandon", "pause", "resume", "end", "retry", "notify"]) }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [task] = await query(conn, "SELECT * FROM connector_tasks WHERE id=? AND connector_id=? FOR UPDATE", [taskId, current.id]);
      if (!task) throw new HttpError(404, "任务不存在");
      if (action === "abandon" && task.status === "queued") {
        await query(conn, "UPDATE connector_tasks SET status='cancelled',progress='已放弃',finished_at=UTC_TIMESTAMP(3),lease_expires_at=NULL WHERE id=?", [taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        await reportConnectorToSource(service, conn, task, "本地执行器已放弃该任务。");
        return { status: "cancelled" };
      }
      if (action === "pause" && task.status === "running") {
        await query(conn, "UPDATE connector_tasks SET status='paused',progress='本机执行已暂停',lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?", [taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        await reportConnectorToSource(service, conn, task, "本地执行器已暂停该任务。");
        return { status: "paused" };
      }
      if (action === "resume" && task.status === "paused") {
        await query(conn, "UPDATE connector_tasks SET status='running',progress='本机 Agent 会话进行中',lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE id=?", [taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        await reportConnectorToSource(service, conn, task, "本地执行器已继续执行该任务。");
        return { status: "running" };
      }
      if (action === "end" && ["running", "paused"].includes(task.status)) {
        await query(conn, "UPDATE connector_tasks SET status='stopped_pending_approval',progress='终止待通过',finished_at=UTC_TIMESTAMP(3),lease_expires_at=NULL WHERE id=?", [taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        await reportConnectorToSource(service, conn, task, "本地执行器已终止该任务，等待确认。");
        return { status: "stopped_pending_approval" };
      }
      if (action === "retry" && ["failed", "failed_pending_notification", "cancelled", "interrupted", "stopped_pending_approval"].includes(task.status)) {
        await query(conn, `UPDATE connector_tasks SET status='queued',progress='等待本机开始',output=NULL,diff=NULL,error=NULL,
          lease_token_hash=NULL,lease_expires_at=NULL,finished_at=NULL WHERE id=?`, [taskId]);
        // 放弃/失败后重试：任务池任务已是终态，普通同步不会改动它，这里显式重新打开并新开执行记录。
        await reopenConnectorTask(conn, taskId, { publish: true });
        await reportConnectorToSource(service, conn, task, "本地执行器已重试该任务。");
        return { status: "queued" };
      }
      if (action === "notify" && ["completed_pending_notification", "failed_pending_notification", "stopped_pending_approval"].includes(task.status)) {
        const stopped = task.status === "stopped_pending_approval";
        const success = task.status === "completed_pending_notification";
        if (!task.response_message_id) {
          const body = stopped ? "本机任务已由执行成员终止。" : success
            ? (task.output || "本机 Agent 已完成修改，请查看代码差异。")
            : `本机 Agent 执行失败：${task.error || "未知错误"}`;
          const response = await reportConnectorToSource(service, conn, task, body);
          await query(conn, "UPDATE connector_tasks SET response_message_id=? WHERE id=?", [response.id, taskId]);
        }
        const status = stopped ? "cancelled" : success ? "completed" : "failed";
        await query(conn, "UPDATE connector_tasks SET status=?,progress=?,finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=?",
          [status, stopped ? "终止" : success ? "成功" : "失败", taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        return { status };
      }
      throw new HttpError(409, "当前状态不能执行这个操作");
    });
    res.json(result);
  });

  app.delete("/api/connector/projects/:id", async (req, res) => {
    const current = await device(db, req);
    const projectId = z.string().uuid().parse(req.params.id);
    await transaction(db, async (conn) => {
      await query(conn, "DELETE FROM connector_projects WHERE connector_id=? AND project_id=?", [current.id, projectId]);
      await query(conn, `UPDATE connector_tasks SET status='cancelled',error='本地执行器已解除项目关联',finished_at=UTC_TIMESTAMP(3)
        WHERE connector_id=? AND project_id=? AND status IN ('queued','running','paused')`, [current.id, projectId]);
      const cancelled = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND project_id=? AND status='cancelled' AND error=?", [current.id, projectId, "本地执行器已解除项目关联"]);
      for (const task of cancelled) await syncConnectorTaskById(conn, task.id, { publish: true });
    });
    res.json({ ok: true });
  });

  app.post("/api/connector/poll", async (req, res) => {
    const current = await device(db, req);
    const data = z.object({ version: z.string().trim().min(1).max(40) }).parse(req.body);
    await transaction(db, async (conn) => {
      await query(conn, "UPDATE connectors SET last_seen_at=UTC_TIMESTAMP(3),version=? WHERE id=?", [data.version, current.id]);
      await query(conn, `UPDATE connector_tasks SET status='interrupted',error='本地连接中断，可在网页重新发起',finished_at=UTC_TIMESTAMP(3)
        WHERE connector_id=? AND status='running' AND lease_expires_at<UTC_TIMESTAMP(3)`, [current.id]);
      const expired = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND status='interrupted' AND error=?", [current.id, "本地连接中断，可在网页重新发起"]);
      for (const task of expired) await syncConnectorTaskById(conn, task.id, { publish: true });
      await query(conn, `UPDATE connector_tasks t LEFT JOIN connector_projects cp
        ON cp.connector_id=t.connector_id AND cp.project_id=t.project_id
        LEFT JOIN members m ON m.project_id=t.project_id AND m.user_id=?
        SET t.status='interrupted',t.error='本地执行器已失去项目执行权限',t.finished_at=UTC_TIMESTAMP(3)
        WHERE t.connector_id=? AND t.status='queued' AND (cp.connector_id IS NULL OR m.user_id IS NULL OR m.role='viewer')`,
      [current.user_id, current.id]);
      const unauthorized = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND status='interrupted' AND error=?", [current.id, "本地执行器已失去项目执行权限"]);
      for (const task of unauthorized) await syncConnectorTaskById(conn, task.id, { publish: true });
    });
    res.json({ task: null });
  });

  app.patch("/api/connector/tasks/:id", async (req, res) => {
    const current = await device(db, req);
    const taskId = z.string().uuid().parse(req.params.id);
    const data = z.object({
      leaseToken: z.string().min(20).max(100),
      status: z.enum(["running", "paused", "completed_pending_notification", "failed_pending_notification", "completed", "failed"]),
      progress: z.string().max(300).optional(),
      output: z.string().max(1000000).optional(),
      diff: z.string().max(2000000).optional(),
      error: z.string().max(1000).optional(),
      agentKind: z.enum(["cursor", "codex", "claude"]).optional(),
    }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [task] = await query(conn, `SELECT *,lease_expires_at>UTC_TIMESTAMP(3) lease_valid
        FROM connector_tasks WHERE id=? AND connector_id=? FOR UPDATE`, [taskId, current.id]);
      if (!task) throw new HttpError(409, "任务不属于当前本地执行器");
      if (task.status === "cancelled") return { status: "cancelled" };
      if (task.lease_token_hash !== digest(data.leaseToken) || Number(task.lease_valid) !== 1)
        throw new HttpError(409, "任务租约无效或已过期");
      if (!["running", "paused"].includes(task.status)) throw new HttpError(409, "任务已结束");
      const agentKind = data.agentKind || task.agent_kind || null;
      if (["running", "paused"].includes(data.status)) {
        const nextProgress = data.progress || task.progress || "正在本机执行";
        await query(conn, `UPDATE connector_tasks SET status=?,progress=?,agent_kind=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MINUTE) WHERE id=?`,
          [data.status, nextProgress, agentKind, data.status === "paused" ? 30 : 2, taskId]);
        await syncConnectorTaskById(conn, taskId, { publish: true });
        if (typeof data.progress === "string" && data.progress !== (task.progress || ""))
          await reportConnectorToSource(service, conn, task, `本地执行器汇报进度：${data.progress}`);
        return { status: data.status };
      }
      let responseMessageId = task.response_message_id;
      if (data.status === "completed" && !responseMessageId) {
        const text = (data.output || "本机 Agent 已完成修改，请查看代码差异。").trim();
        const response = await reportConnectorToSource(service, conn, task, text);
        responseMessageId = response.id;
      }
      await query(conn, `UPDATE connector_tasks SET status=?,progress=?,agent_kind=?,output=?,diff=?,error=?,response_message_id=?,
        lease_expires_at=NULL,finished_at=UTC_TIMESTAMP(3) WHERE id=?`, [data.status,
        ["completed", "completed_pending_notification"].includes(data.status) ? (data.status === "completed" ? "成功" : "成功待通知") : (data.status === "failed" ? "失败" : "失败待通知"),
        agentKind, data.output || null, data.diff || null,
        ["failed", "failed_pending_notification"].includes(data.status) ? data.error || "本机执行失败" : null, responseMessageId, taskId]);
      await syncConnectorTaskById(conn, taskId, { publish: true });
      return { status: data.status };
    });
    res.json(result);
  });
}

export function registerConnectorBrowserRoutes(app, db, service) {
  app.get("/api/connectors", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const rows = await query(db, `SELECT c.id,c.name,c.platform,c.version,c.last_seen_at,c.created_at,
      c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) online,
      COALESCE(JSON_ARRAYAGG(IF(cp.project_id IS NULL,NULL,JSON_OBJECT('projectId',cp.project_id,'policy',cp.policy,'allowGitPush',cp.allow_git_push))),JSON_ARRAY()) projects
      FROM connectors c LEFT JOIN connector_projects cp ON cp.connector_id=c.id
      WHERE c.user_id=? AND c.revoked_at IS NULL GROUP BY c.id ORDER BY c.created_at DESC`, [req.user.id]);
    res.json(rows.map((row) => ({ ...row, projects: (typeof row.projects === "string" ? JSON.parse(row.projects) : row.projects).filter(Boolean) })));
  });

  app.get("/api/connectors/availability", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.json(await query(db, `SELECT m.project_id projectId,c.id,c.name,c.platform,c.user_id ownerId,u.name ownerName,cp.policy,cp.allow_git_push allowGitPush
      FROM members m JOIN connector_projects cp ON cp.project_id=m.project_id
      JOIN connectors c ON c.id=cp.connector_id AND c.revoked_at IS NULL
        AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)
      JOIN users u ON u.id=c.user_id
      JOIN members cm ON cm.project_id=m.project_id AND cm.user_id=c.user_id AND cm.role<>'viewer'
      WHERE m.user_id=? ORDER BY m.project_id,u.name,c.last_seen_at DESC,c.id`, [req.user.id]));
  });

  app.get(["/api/connector-authorizations/:id", "/api/connector-authorizations-v2/:id"], async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const authorizationId = z.string().uuid().parse(req.params.id);
    const [authorization] = await query(db, `SELECT id,name,platform,version,expires_at,approved_at,denied_at,consumed_at
      FROM connector_authorizations WHERE id=? AND UNIX_TIMESTAMP(expires_at)>UNIX_TIMESTAMP()`, [authorizationId]);
    if (!authorization) throw new HttpError(404, "本地执行器授权请求不存在或已过期");
    res.json(authorization);
  });

  app.post("/api/connector-authorizations/:id/decision", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const authorizationId = z.string().uuid().parse(req.params.id);
    const data = z.object({ approved: z.boolean() }).parse(req.body);
    const result = await query(db, `UPDATE connector_authorizations SET user_id=?,approved_at=?,denied_at=?
      WHERE id=? AND UNIX_TIMESTAMP(expires_at)>UNIX_TIMESTAMP()
      AND approved_at IS NULL AND denied_at IS NULL AND consumed_at IS NULL`,
    [data.approved ? req.user.id : null, data.approved ? new Date() : null, data.approved ? null : new Date(), authorizationId]);
    if (!result.affectedRows) throw new HttpError(409, "授权请求已处理或已过期");
    res.json({ status: data.approved ? "approved" : "denied" });
  });

  app.post("/api/connector-authorizations-v2/:id/decision", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const authorizationId = z.string().uuid().parse(req.params.id);
    const data = z.object({ approved: z.boolean(), callbackSecret: z.string().min(30).max(100) }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [authorization] = await query(conn, `SELECT *,UNIX_TIMESTAMP(expires_at)>UNIX_TIMESTAMP() valid
        FROM connector_authorizations WHERE id=? FOR UPDATE`, [authorizationId]);
      if (!authorization || Number(authorization.valid) !== 1) throw new HttpError(404, "本地执行器授权请求不存在或已过期");
      if (authorization.poll_token_hash !== digest(data.callbackSecret)) throw new HttpError(401, "授权回调凭证不匹配");
      if (authorization.approved_at || authorization.denied_at || authorization.consumed_at)
        throw new HttpError(409, "授权请求已处理或已过期");
      if (!data.approved) {
        await query(conn, "UPDATE connector_authorizations SET denied_at=CURRENT_TIMESTAMP(3) WHERE id=?", [authorizationId]);
        return { status: "denied" };
      }
      const token = connectorToken();
      const connectorId = await replaceAccountConnector(conn, req.user.id, authorization, token);
      await query(conn, `UPDATE connector_authorizations SET user_id=?,approved_at=CURRENT_TIMESTAMP(3),consumed_at=CURRENT_TIMESTAMP(3)
        WHERE id=?`, [req.user.id, authorizationId]);
      return { status: "approved", id: connectorId, token };
    });
    res.json(result);
  });

  app.post("/api/connectors/pairings", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const code = pairingCode();
    await query(db, "DELETE FROM connector_pairings WHERE user_id=? OR expires_at<UTC_TIMESTAMP(3)", [req.user.id]);
    await query(db, `INSERT INTO connector_pairings(id,user_id,code_hash,expires_at)
      VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`, [randomUUID(), req.user.id, digest(code)]);
    res.status(201).json({ code, expiresIn: 600 });
  });

  app.delete("/api/connectors/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const connectorId = z.string().uuid().parse(req.params.id);
    const result = await query(db, `UPDATE connectors SET revoked_at=UTC_TIMESTAMP(3),token_hash=SHA2(CONCAT(token_hash,UUID()),256)
      WHERE id=? AND user_id=? AND revoked_at IS NULL`, [connectorId, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, "本地执行器不存在");
    await query(db, `UPDATE connector_tasks SET status='cancelled',error='本地执行器已解除绑定',finished_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND status IN ('queued','running')`, [connectorId]);
    const cancelled = await query(db, "SELECT id FROM connector_tasks WHERE connector_id=? AND status='cancelled' AND error=?", [connectorId, "本地执行器已解除绑定"]);
    for (const task of cancelled) await syncConnectorTaskById(db, task.id, { publish: true });
    res.json({ ok: true });
  });

  app.post("/api/connector-tasks/:id/cancel", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const taskId = z.string().uuid().parse(req.params.id);
    const result = await query(db, `UPDATE connector_tasks SET status='cancelled',error='已停止',finished_at=UTC_TIMESTAMP(3)
      WHERE id=? AND assigned_to=? AND status IN ('queued','running','paused')`,
    [taskId, req.user.id]);
    if (!result.affectedRows) throw new HttpError(409, "任务已结束或不存在");
    await syncConnectorTaskById(db, taskId, { publish: true });
    res.json({ ok: true });
  });
}
