import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { digest } from "./auth.js";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";

const pairingCode = () => randomBytes(9).toString("base64url").toUpperCase();
const bearer = (req) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
const connectorToken = () => `ctc_${randomBytes(32).toString("base64url")}`;

async function device(db, req) {
  const token = bearer(req);
  if (!token?.startsWith("ctc_")) throw new HttpError(401, "连接器凭证无效");
  const [row] = await query(db, `SELECT c.*,u.disabled_at FROM connectors c JOIN users u ON u.id=c.user_id
    WHERE c.token_hash=? AND c.revoked_at IS NULL`, [digest(token)]);
  if (!row || row.disabled_at) throw new HttpError(401, "连接器凭证无效或已撤销");
  return row;
}

async function replaceAccountConnector(conn, userId, data, token) {
  await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
  const [existing] = await query(conn, "SELECT id FROM connectors WHERE user_id=? FOR UPDATE", [userId]);
  if (existing) {
    await query(conn, `UPDATE connector_tasks SET status='cancelled',error='账号已在另一台电脑重新连接',finished_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND status IN ('awaiting_approval','queued','running','paused')`, [existing.id]);
    await query(conn, "DELETE FROM connector_projects WHERE connector_id=?", [existing.id]);
    await query(conn, `UPDATE connectors SET name=?,platform=?,version=?,token_hash=?,last_seen_at=UTC_TIMESTAMP(3),revoked_at=NULL
      WHERE id=?`, [data.name, data.platform, data.version, digest(token), existing.id]);
    return existing.id;
  }
  const id = randomUUID();
  await query(conn, `INSERT INTO connectors(id,user_id,name,platform,version,token_hash,last_seen_at)
    VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [id, userId, data.name, data.platform, data.version, digest(token)]);
  return id;
}

export async function connectorTool(service, user, name, input, job, thread) {
  if (name === "list_local_connectors") {
    return query(service.db, `SELECT c.id,c.name,c.platform,c.version,cp.policy,cp.allow_git_push allowGitPush,u.id owner_id,u.name owner_name,
      c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) online
      FROM connectors c JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
      JOIN members m ON m.project_id=cp.project_id AND m.user_id=c.user_id
      JOIN users u ON u.id=c.user_id
      WHERE m.role<>'viewer' AND c.revoked_at IS NULL
      ORDER BY online DESC,u.name,c.last_seen_at DESC,c.created_at DESC`, [thread.project_id]);
  }
  const data = z.object({
    connectorId: z.string().uuid().optional(),
    prompt: z.string().trim().min(80).max(20000),
  }).parse(input);
  const [read] = await query(service.db, `SELECT id FROM agent_events WHERE message_id=? AND tool IN ('project_context','read_document')
    AND status='completed' LIMIT 1`, [job.message_id]);
  if (!read) throw new HttpError(409, "请先读取项目资料目录和相关文档，再整理本地 Codex 任务");
  const [targetMessage] = await query(service.db, "SELECT execution_target_user_id FROM messages WHERE id=?", [job.message_id]);
  if (!targetMessage?.execution_target_user_id) throw new HttpError(409, "本机任务缺少已确认的执行成员");
  const params = [thread.project_id, targetMessage.execution_target_user_id];
  const connectors = await query(service.db, `SELECT c.id,c.name,cp.policy,cp.allow_git_push allow_git_push,c.user_id assigned_to,u.name owner_name FROM connectors c
    JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
    JOIN members m ON m.project_id=cp.project_id AND m.user_id=c.user_id
    JOIN users u ON u.id=c.user_id
    WHERE c.user_id=? AND m.role<>'viewer' AND c.revoked_at IS NULL AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)
    ${data.connectorId ? "AND c.id=?" : ""} ORDER BY c.last_seen_at DESC LIMIT 1`,
  data.connectorId ? [...params, data.connectorId] : params);
  const connector = connectors[0];
  if (!connector) throw new HttpError(409, "没有已关联当前项目的在线连接器，请让成员打开本地连接器");
  if (!data.connectorId) {
    const [count] = await query(service.db, `SELECT COUNT(*) total FROM connectors c
      JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
      JOIN members m ON m.project_id=cp.project_id AND m.user_id=c.user_id
      WHERE c.user_id=? AND m.role<>'viewer' AND c.revoked_at IS NULL
      AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND)`, params);
    if (Number(count.total) > 1)
      throw new HttpError(409, "当前项目有多台在线连接器，请先查看列表，并按被 @ 成员明确指定 connectorId");
  }
  const existing = (await query(service.db, "SELECT id,status FROM connector_tasks WHERE message_id=?", [job.message_id]))[0];
  if (existing) return { ...existing, reused: true, connector: connector.name };
  const id = randomUUID();
  await query(service.db, `INSERT INTO connector_tasks(id,connector_id,project_id,thread_id,message_id,requested_by,assigned_to,instruction,policy,allow_git_push)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, [id, connector.id, thread.project_id, job.thread_id, job.message_id, user.id,
    connector.assigned_to, data.prompt, connector.policy, connector.allow_git_push]);
  return { id, status: "awaiting_approval", connector: connector.name, connectorOwner: connector.owner_name, policy: connector.policy,
    allowGitPush: !!connector.allow_git_push,
    note: "任务说明已发送给执行成员确认；确认前不会访问本地项目，执行成员也可以转交给其他在线成员。" };
}

export function registerConnectorPublicRoutes(app, db, service) {
  app.post(["/api/connector/authorizations", "/api/connector/v2/authorizations"], async (req, res) => {
    const data = z.object({
      name: z.string().trim().min(1).max(100),
      platform: z.string().trim().min(1).max(40).default("windows"),
      version: z.string().trim().min(1).max(40),
    }).parse(req.body);
    const id = randomUUID();
    const pollToken = randomBytes(32).toString("base64url");
    await query(db, "DELETE FROM connector_authorizations WHERE UNIX_TIMESTAMP(expires_at)<UNIX_TIMESTAMP()");
    await query(db, `INSERT INTO connector_authorizations(id,poll_token_hash,name,platform,version,expires_at)
      VALUES(?,?,?,?,?,FROM_UNIXTIME(UNIX_TIMESTAMP()+600))`,
    [id, digest(pollToken), data.name, data.platform, data.version]);
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
      if (authorization.denied_at) throw new HttpError(403, "用户已拒绝连接器授权");
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

  app.get("/api/connector/releases/latest", (req, res) => {
    const version = process.env.CONNECTOR_RELEASE_VERSION;
    const url = process.env.CONNECTOR_DOWNLOAD_URL;
    const sha256 = process.env.CONNECTOR_RELEASE_SHA256;
    const signature = process.env.CONNECTOR_RELEASE_SIGNATURE;
    if (!version || !url || !sha256 || !signature)
      throw new HttpError(404, "连接器更新尚未发布");
    res.json({ version, url, sha256, signature });
  });

  app.get("/api/connector/projects", async (req, res) => {
    const current = await device(db, req);
    await query(db, "UPDATE connectors SET last_seen_at=UTC_TIMESTAMP(3),version=COALESCE(?,version) WHERE id=?",
      [typeof req.query.version === "string" ? req.query.version.slice(0, 40) : null, current.id]);
    res.json(await query(db, `SELECT p.id,p.name,m.role,cp.policy,cp.allow_git_push allowGitPush,cp.connector_id IS NOT NULL bound
      FROM members m JOIN projects p ON p.id=m.project_id
      LEFT JOIN connector_projects cp ON cp.project_id=p.id AND cp.connector_id=?
      WHERE m.user_id=? AND p.archived_at IS NULL ORDER BY p.name,p.id`, [current.id, current.user_id]));
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
    res.json(await query(db, `SELECT t.id,p.name projectName,th.title threadTitle,u.name requestedByName,t.instruction target,
      t.status,t.progress,t.created_at receivedAt,t.started_at firstStartedAt,t.updated_at latestAt,t.finished_at finishedAt
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
      const [active] = await query(conn, "SELECT id FROM connector_tasks WHERE connector_id=? AND status IN ('running','paused') LIMIT 1", [current.id]);
      if (active) throw new HttpError(409, "当前连接器已有正在执行或暂停的任务");
      const [candidate] = await query(conn, `SELECT t.id,t.project_id,t.thread_id,t.message_id,t.instruction,t.policy,t.allow_git_push,p.name project_name
        FROM connector_tasks t JOIN projects p ON p.id=t.project_id
        JOIN connector_projects cp ON cp.connector_id=t.connector_id AND cp.project_id=t.project_id
        JOIN members m ON m.project_id=t.project_id AND m.user_id=? AND m.role<>'viewer'
        WHERE t.id=? AND t.connector_id=? AND t.assigned_to=? AND t.status='queued' FOR UPDATE`,
      [current.user_id, taskId, current.id, current.user_id]);
      if (!candidate) throw new HttpError(409, "任务已被处理或当前连接器没有执行权限");
      await query(conn, `UPDATE connector_tasks SET status='running',lease_token_hash=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE),
        started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),progress='正在本机准备项目' WHERE id=?`, [digest(lease), taskId]);
      return { ...candidate, leaseToken: lease };
    });
    res.json({ task });
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
        return { status: "cancelled" };
      }
      if (action === "pause" && task.status === "running") {
        await query(conn, "UPDATE connector_tasks SET status='paused',progress='本机执行已暂停',lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?", [taskId]);
        return { status: "paused" };
      }
      if (action === "resume" && task.status === "paused") {
        await query(conn, "UPDATE connector_tasks SET status='running',progress='本机 Codex 正在执行',lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE id=?", [taskId]);
        return { status: "running" };
      }
      if (action === "end" && ["running", "paused"].includes(task.status)) {
        await query(conn, "UPDATE connector_tasks SET status='stopped_pending_approval',progress='终止待通过',finished_at=UTC_TIMESTAMP(3),lease_expires_at=NULL WHERE id=?", [taskId]);
        return { status: "stopped_pending_approval" };
      }
      if (action === "retry" && ["failed", "failed_pending_notification", "cancelled", "interrupted", "stopped_pending_approval"].includes(task.status)) {
        await query(conn, `UPDATE connector_tasks SET status='queued',progress='等待本机开始',output=NULL,diff=NULL,error=NULL,
          lease_token_hash=NULL,lease_expires_at=NULL,finished_at=NULL WHERE id=?`, [taskId]);
        return { status: "queued" };
      }
      if (action === "notify" && ["completed_pending_notification", "failed_pending_notification", "stopped_pending_approval"].includes(task.status)) {
        const stopped = task.status === "stopped_pending_approval";
        const success = task.status === "completed_pending_notification";
        if (!task.response_message_id) {
          const body = stopped ? "本机任务已由执行成员终止。" : success
            ? (task.output || "本地 Codex 已完成修改，请查看代码差异。")
            : `本地 Codex 执行失败：${task.error || "未知错误"}`;
          const response = await service.insertMessage(conn, { id: task.assigned_to, kind: "api" },
            task.thread_id, body.slice(0, 20000), [], "local_ai", task.message_id);
          await query(conn, "UPDATE connector_tasks SET response_message_id=? WHERE id=?", [response.id, taskId]);
        }
        const status = stopped ? "cancelled" : success ? "completed" : "failed";
        await query(conn, "UPDATE connector_tasks SET status=?,progress=?,finished_at=COALESCE(finished_at,UTC_TIMESTAMP(3)) WHERE id=?",
          [status, stopped ? "终止" : success ? "成功" : "失败", taskId]);
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
      await query(conn, `UPDATE connector_tasks SET status='cancelled',error='连接器已解除项目关联',finished_at=UTC_TIMESTAMP(3)
        WHERE connector_id=? AND project_id=? AND status IN ('queued','running','paused')`, [current.id, projectId]);
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
      await query(conn, `UPDATE connector_tasks t LEFT JOIN connector_projects cp
        ON cp.connector_id=t.connector_id AND cp.project_id=t.project_id
        LEFT JOIN members m ON m.project_id=t.project_id AND m.user_id=?
        SET t.status='interrupted',t.error='连接器已失去项目执行权限',t.finished_at=UTC_TIMESTAMP(3)
        WHERE t.connector_id=? AND t.status='queued' AND (cp.connector_id IS NULL OR m.user_id IS NULL OR m.role='viewer')`,
      [current.user_id, current.id]);
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
    }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [task] = await query(conn, `SELECT *,lease_expires_at>UTC_TIMESTAMP(3) lease_valid
        FROM connector_tasks WHERE id=? AND connector_id=? FOR UPDATE`, [taskId, current.id]);
      if (!task) throw new HttpError(409, "任务不属于当前连接器");
      if (task.status === "cancelled") return { status: "cancelled" };
      if (task.lease_token_hash !== digest(data.leaseToken) || Number(task.lease_valid) !== 1)
        throw new HttpError(409, "任务租约无效或已过期");
      if (!["running", "paused"].includes(task.status)) throw new HttpError(409, "任务已结束");
      if (["running", "paused"].includes(data.status)) {
        await query(conn, `UPDATE connector_tasks SET status=?,progress=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MINUTE) WHERE id=?`,
          [data.status, data.progress || task.progress || "正在本机执行", data.status === "paused" ? 30 : 2, taskId]);
        return { status: data.status };
      }
      let responseMessageId = task.response_message_id;
      if (data.status === "completed" && !responseMessageId) {
        const text = (data.output || "本地 Codex 已完成修改，请查看代码差异。").trim();
        const response = await service.insertMessage(conn, { id: task.assigned_to, kind: "api" },
          task.thread_id, text.slice(0, 20000), [], "local_ai", task.message_id);
        responseMessageId = response.id;
      }
      await query(conn, `UPDATE connector_tasks SET status=?,progress=?,output=?,diff=?,error=?,response_message_id=?,
        lease_expires_at=NULL,finished_at=UTC_TIMESTAMP(3) WHERE id=?`, [data.status,
        ["completed", "completed_pending_notification"].includes(data.status) ? (data.status === "completed" ? "成功" : "成功待通知") : (data.status === "failed" ? "失败" : "失败待通知"),
        data.output || null, data.diff || null,
        ["failed", "failed_pending_notification"].includes(data.status) ? data.error || "本机执行失败" : null, responseMessageId, taskId]);
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
    res.json(await query(db, `SELECT m.project_id projectId,c.id,c.name,c.user_id ownerId,u.name ownerName,cp.policy,cp.allow_git_push allowGitPush
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
    if (!authorization) throw new HttpError(404, "连接器授权请求不存在或已过期");
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
      if (!authorization || Number(authorization.valid) !== 1) throw new HttpError(404, "连接器授权请求不存在或已过期");
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
    if (!result.affectedRows) throw new HttpError(404, "连接器不存在");
    await query(db, `UPDATE connector_tasks SET status='cancelled',error='连接器已解除绑定',finished_at=UTC_TIMESTAMP(3)
      WHERE connector_id=? AND status IN ('queued','running')`, [connectorId]);
    res.json({ ok: true });
  });

  app.get("/api/connectors/download", (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const url = process.env.CONNECTOR_DOWNLOAD_URL;
    if (!url) throw new HttpError(503, "Windows 连接器安装包尚未发布");
    res.redirect(302, url);
  });

  app.post("/api/connector-tasks/:id/cancel", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const taskId = z.string().uuid().parse(req.params.id);
    const result = await query(db, `UPDATE connector_tasks SET status='cancelled',error='已停止',finished_at=UTC_TIMESTAMP(3)
      WHERE id=? AND (requested_by=? OR assigned_to=?) AND status IN ('awaiting_approval','queued','running','paused')`,
    [taskId, req.user.id, req.user.id]);
    if (!result.affectedRows) throw new HttpError(409, "任务已结束或不存在");
    res.json({ ok: true });
  });

  app.post("/api/connector-tasks/:id/decision", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const taskId = z.string().uuid().parse(req.params.id);
    const data = z.object({ approved: z.boolean(), prompt: z.string().trim().min(80).max(20000).optional() }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [task] = await query(conn, `SELECT t.*,c.revoked_at,cp.connector_id binding_id,m.role connector_role FROM connector_tasks t
        JOIN connectors c ON c.id=t.connector_id LEFT JOIN connector_projects cp ON cp.connector_id=t.connector_id AND cp.project_id=t.project_id
        LEFT JOIN members m ON m.project_id=t.project_id AND m.user_id=c.user_id
        WHERE t.id=? AND t.assigned_to=? FOR UPDATE`, [taskId, req.user.id]);
      if (!task) throw new HttpError(404, "待确认任务不存在");
      if (task.status !== "awaiting_approval") throw new HttpError(409, "任务已经确认或结束");
      if (data.approved && (task.revoked_at || !task.binding_id || !task.connector_role || task.connector_role === "viewer"))
        throw new HttpError(409, "连接器已失去项目执行权限，请转交给其他在线成员");
      const status = data.approved ? "queued" : "cancelled";
      await query(conn, `UPDATE connector_tasks SET status=?,instruction=?,progress=?,error=?,finished_at=? WHERE id=?`,
        [status, data.prompt || task.instruction, data.approved ? "等待本机连接器领取" : "已取消",
          data.approved ? null : "执行成员取消了任务", data.approved ? null : new Date(), taskId]);
      return { id: taskId, status };
    });
    res.json(result);
  });

  app.post("/api/connector-tasks/:id/reassign", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const taskId = z.string().uuid().parse(req.params.id);
    const data = z.object({ connectorId: z.string().uuid() }).parse(req.body);
    const result = await transaction(db, async (conn) => {
      const [task] = await query(conn, "SELECT * FROM connector_tasks WHERE id=? AND assigned_to=? FOR UPDATE", [taskId, req.user.id]);
      if (!task) throw new HttpError(404, "待确认任务不存在或不属于你");
      if (task.status !== "awaiting_approval") throw new HttpError(409, "只有未确认任务可以转交");
      const [target] = await query(conn, `SELECT c.id,c.user_id,cp.policy,cp.allow_git_push,u.name owner_name,c.name connector_name FROM connectors c
        JOIN connector_projects cp ON cp.connector_id=c.id AND cp.project_id=?
        JOIN members m ON m.project_id=cp.project_id AND m.user_id=c.user_id AND m.role<>'viewer'
        JOIN users u ON u.id=c.user_id
        WHERE c.id=? AND c.revoked_at IS NULL
        AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) FOR UPDATE`, [task.project_id, data.connectorId]);
      if (!target) throw new HttpError(409, "目标成员没有关联当前项目的在线连接器");
      if (target.user_id === task.assigned_to) throw new HttpError(409, "请选择其他在线成员");
      await query(conn, `UPDATE connector_tasks SET connector_id=?,assigned_to=?,policy=?,allow_git_push=?,progress=? WHERE id=?`,
        [target.id, target.user_id, target.policy, target.allow_git_push, `等待 ${target.owner_name} 确认`, taskId]);
      await service.notify(conn, target.user_id, task.project_id, "mention",
        `${req.user.name || "项目成员"} 将一项本机 Codex 待确认任务转交给你`, task.thread_id, task.message_id,
        req.user.name || "项目成员");
      return { id: taskId, status: "awaiting_approval", assignedTo: target.user_id,
        connector: target.connector_name, connectorOwner: target.owner_name };
    });
    res.json(result);
  });
}
