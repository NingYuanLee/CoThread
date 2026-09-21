import { streamLiveOutput } from "./agent-live-output.js";
import { SUMMARY_REQUEST } from "../shared/agent-member.js";
import { queueContextCompression } from "./queue-context.js";
import { queueL1ContextCompression, readL1TaskSession } from "./l1-context.js";
import { queueL3ContextCompression } from "./l3-context.js";
import { appendL3TaskSession, readL3TaskSession } from "./l3-session.js";
import { readVisualArtifact } from "./visual-artifacts.js";
import { queueDocumentOrganization } from "./document-organization.js";
import { queueL1MemoryRun } from "./project-memory.js";
import express from "express";
import { emptyLibraryRecycle, libraryChange } from "./library.js";
import { countDocumentChanges, listDocumentChanges } from "./document-audit.js";
import { z, ZodError } from "zod/v3";
import {
  authenticate,
  verifyPassword,
  issueCredential,
  hashPassword,
  accountCredential,
} from "./auth.js";
import { decryptToken } from "./credential-vault.js";
import { query, transaction } from "./db.js";
import { Service, HttpError } from "./service.js";
import { handleMcp } from "./mcp.js";
import { retryReply } from "./reply-actions.js";
import { personalProfile, profileSchema } from "./profile.js";
import { UI_THEMES, normalizeUiTheme } from "../shared/ui-theme.js";
import { registerRequestParts } from "./request-parts.js";
import { completeFileUpload, putFileUploadChunk, startFileUpload } from "./file-upload.js";
import { requestTiming } from "./request-timing.js";
import { resolveIpLocation } from "./ip-location.js";
import { randomUUID } from "node:crypto";
import { randomInt } from "node:crypto";
import { digest } from "./auth.js";
import { sendVerificationEmail as deliverVerificationEmail } from "./email-delivery.js";
import { createHumanChallenge as generateHumanChallenge } from "./human-challenge.js";
import { registerConnectorBrowserRoutes, registerConnectorPublicRoutes } from "./connectors.js";
import { acceptTask, acknowledgeTaskRejection, cancelTask, createTask, getTask, listAssignmentEvents, answerTaskQuestion, listTaskExecutionRuns, listTaskQuestions, listTaskStatusEvents, listTaskUpdates, listTasks, mergeTaskActivity, reassignTask, rejectTask, reopenRejectedTask, taskExecutionSnapshot, taskRejectionReview, updateTask } from "./task-pool.js";
import { mentionTaskSourceNotice, taskSourceMentionToken, taskStatusLabel, withTaskSourceMention } from "./task-source-notice.js";
import { adminPluginManagement, archivePromptSkill, createPromptSkill, updatePromptSkill } from "./agent-capabilities.js";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";

export function createApp(db, { makers = false, afterMcpMessage, executeRun, stopAgent = async () => {},
  sendVerificationEmail = deliverVerificationEmail,
  createHumanChallenge = generateHumanChallenge } = {}) {
  const app = express();
  const service = new Service(db);
  app.disable("x-powered-by");
  app.use(requestTiming);
  const origins = (() => {
    if (process.env.APP_ORIGIN) {
      const list = [process.env.APP_ORIGIN];
      if (!makers) {
        for (const local of ["http://127.0.0.1:3100", "http://localhost:3100"]) {
          if (!list.includes(local)) list.push(local);
        }
      }
      return list;
    }
    return makers
      ? ["http://cothread.z2l.top", "https://cothread.z2l.top"]
      : ["http://127.0.0.1:3100", "http://localhost:3100"];
  })();
  if (makers) app.set("trust proxy", 1);
  const attempts = new Map();
  const emailAttempts = new Map();
  const humanChallengeAttempts = new Map();
  const secure = process.env.COOKIE_SECURE === "true";
  const sessionCookie = (token, req) =>
    `cothread_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${secure || (makers && req?.secure) ? "; Secure" : ""}`;
  const appendCookie = (res, value, first = false) => {
    const current = res.getHeader("Set-Cookie");
    const values = current ? (Array.isArray(current) ? current : [current]) : [];
    res.setHeader("Set-Cookie", first ? [value, ...values] : [...values, value]);
  };
  const cookieValue = (req, name) => req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const browserIdentity = (req, res) => {
    let id = cookieValue(req, "cothread_browser");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
      id = randomUUID();
      appendCookie(res, `cothread_browser=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure || (makers && req?.secure) ? "; Secure" : ""}`);
    }
    return digest(id);
  };
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (
      (req.path.startsWith("/api") || req.path === "/mcp") &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return res.status(403).json({ error: "请求来源不受信任" });
    if (req.path.startsWith("/api") || req.path === "/mcp")
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32mb" }));
  registerConnectorPublicRoutes(app, db, service, { makers });
  app.get("/api/health", async (req, res) => {
    await query(db, "SELECT 1");
    res.json({
      status: "ok",
      database: "mysql",
      sandbox: makers ? "makers" : "local",
      sandboxConfigured: true,
      dshEnabled: process.env.DSH_ENABLED !== "false",
      ...(makers ? { agentEndpoint: "/cothread-agent", mcpEndpoint: "/cothread-mcp" } : {}),
    });
  });
  const email = z.string().email().max(191).transform((value) => value.toLowerCase());
  const challengeInput = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
  const humanProofInput = z.object({
    humanChallengeId: z.string().uuid(),
    humanAnswer: z.string().trim().min(1).max(12),
  });
  const optionalHumanProofInput = z.object({
    humanChallengeId: z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional()),
    humanAnswer: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value,
      z.string().trim().min(1).max(12).optional()),
  });
  const throttleEmail = (req, purpose) => {
    const now = Date.now(), key = `${req.ip}:${purpose}`;
    const current = emailAttempts.get(key);
    const record = !current || current.reset <= now ? { count: 0, reset: now + 600000 } : current;
    emailAttempts.set(key, record);
    if (++record.count > 5) throw new HttpError(429, "验证码发送过于频繁，请稍后重试");
  };
  const issueChallenge = async ({ purpose, address, targetUserId = null, payload = {} }) => {
    const [recent] = await query(db, `SELECT GREATEST(1,60-TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP(3))) retry_after
      FROM email_challenges WHERE email=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND)
      ORDER BY created_at DESC LIMIT 1`, [address]);
    if (recent) throw new HttpError(429, `请在 ${Number(recent.retry_after)} 秒后重新发送`);
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    await query(db, "UPDATE email_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE purpose=? AND email=? AND consumed_at IS NULL", [purpose, address]);
    await query(db, `INSERT INTO email_challenges(id,purpose,email,target_user_id,code_hash,payload,expires_at)
      VALUES(?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,
      [challengeId, purpose, address, targetUserId, digest(`${challengeId}:${code}`), JSON.stringify(payload)]);
    try { await sendVerificationEmail({ email: address, code, purpose }); }
    catch (error) {
      await query(db, "DELETE FROM email_challenges WHERE id=?", [challengeId]);
      throw new HttpError(503, error instanceof Error ? error.message : "验证码发送失败");
    }
    const localDev = !makers && ["127.0.0.1", "localhost", "::1"].includes(process.env.HOST || "127.0.0.1");
    if (localDev) console.log(`本机验证码 [${purpose}] ${address}: ${code}`);
    return {
      challengeId, expiresIn: 600, resendAfter: 60, deliveryStatus: "accepted",
      ...(localDev ? { devCode: code } : {}),
    };
  };
  const recentActivityCount = async (browserHash, kind) => {
    const [row] = await query(db, `SELECT COUNT(*) count FROM human_verification_activity
      WHERE browser_hash=? AND kind=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)`, [browserHash, kind]);
    return Number(row.count);
  };
  const verificationRequired = async (browserHash, scope) => scope === "auth"
    ? (await recentActivityCount(browserHash, "auth_email_send")) >= 3
      || (await recentActivityCount(browserHash, "auth_login_failure")) >= 3
    : (await recentActivityCount(browserHash, "bind_email_send")) >= 3;
  const recordActivity = (browserHash, kind) => query(db,
    "INSERT INTO human_verification_activity(id,browser_hash,kind) VALUES(?,?,?)", [randomUUID(), browserHash, kind]);
  const clearActivity = (browserHash, kind) => query(db,
    "DELETE FROM human_verification_activity WHERE browser_hash=? AND kind=?", [browserHash, kind]);
  app.get("/api/human-verification/status", async (req, res) => {
    const scope = z.enum(["auth", "bind"]).parse(req.query.scope);
    res.json({ required: await verificationRequired(browserIdentity(req, res), scope) });
  });
  app.get("/api/human-verification", async (req, res) => {
    const purpose = z.enum(["auth", "bind"]).parse(req.query.purpose);
    const browserHash = browserIdentity(req, res);
    const now = Date.now(), key = req.ip;
    const current = humanChallengeAttempts.get(key);
    const record = !current || current.reset <= now ? { count: 0, reset: now + 600000 } : current;
    humanChallengeAttempts.set(key, record);
    if (++record.count > 30) throw new HttpError(429, "人类验证请求过于频繁，请稍后重试");
    const challengeId = randomUUID();
    const challenge = createHumanChallenge();
    await query(db, "DELETE FROM human_verification_challenges WHERE expires_at<UTC_TIMESTAMP(3) OR created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)");
    await query(db, `INSERT INTO human_verification_challenges(id,purpose,answer_hash,request_ip_hash,expires_at)
      VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))`,
      [challengeId, purpose, digest(`${challengeId}:${challenge.text.toLowerCase()}`), browserHash]);
    res.json({ challengeId, image: `data:image/svg+xml;base64,${Buffer.from(challenge.data).toString("base64")}`, expiresIn: 300 });
  });
  const verifyHuman = async (req, res, input, purpose) => {
    const proof = humanProofInput.parse(input);
    const browserHash = browserIdentity(req, res);
    const accepted = await transaction(db, async (conn) => {
      const [challenge] = await query(conn, "SELECT * FROM human_verification_challenges WHERE id=? FOR UPDATE", [proof.humanChallengeId]);
      if (!challenge || challenge.purpose !== purpose || challenge.request_ip_hash !== browserHash
        || challenge.consumed_at || challenge.expires_at <= new Date() || challenge.attempts >= 5) return false;
      if (challenge.answer_hash !== digest(`${challenge.id}:${proof.humanAnswer.toLowerCase()}`)) {
        await query(conn, "UPDATE human_verification_challenges SET attempts=attempts+1 WHERE id=?", [challenge.id]);
        return false;
      }
      await query(conn, "UPDATE human_verification_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?", [challenge.id]);
      return true;
    });
    if (!accepted) throw new HttpError(400, "人类验证码无效或已过期，请刷新后重试");
  };
  const requireHumanWhenNeeded = async (req, res, input, scope) => {
    const browserHash = browserIdentity(req, res);
    if (await verificationRequired(browserHash, scope)) {
      if (!input.humanChallengeId || !input.humanAnswer) throw new HttpError(400, "请先完成人类验证");
      await verifyHuman(req, res, input, scope);
    }
    return browserHash;
  };
  const verifiedChallenge = async (input, purpose, targetUserId) => {
    const data = challengeInput.parse(input);
    const result = await transaction(db, async (conn) => {
      const [challenge] = await query(conn, "SELECT * FROM email_challenges WHERE id=? FOR UPDATE", [data.challengeId]);
      if (!challenge || challenge.purpose !== purpose || challenge.consumed_at || challenge.expires_at <= new Date()
        || challenge.attempts >= 5 || (targetUserId && challenge.target_user_id !== targetUserId)) return null;
      if (challenge.code_hash !== digest(`${challenge.id}:${data.code}`)) {
        await query(conn, "UPDATE email_challenges SET attempts=attempts+1 WHERE id=?", [challenge.id]);
        return null;
      }
      await query(conn, "UPDATE email_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?", [challenge.id]);
      return challenge;
    });
    if (!result) throw new HttpError(400, "验证码无效或已过期");
    return result;
  };
  app.post("/api/email/register/request", async (req, res) => {
    const data = z.object({ email,
      password: z.string().min(8).max(200) }).merge(optionalHumanProofInput).parse(req.body);
    const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
    throttleEmail(req, "register");
    if ((await query(db, "SELECT id FROM users WHERE email=? OR username=?", [data.email, data.email])).length) throw new HttpError(409, "该邮箱已存在账号");
    const result = await issueChallenge({ purpose: "register", address: data.email,
      payload: { username: data.email, passwordHash: await hashPassword(data.password) } });
    await recordActivity(browserHash, "auth_email_send");
    res.json(result);
  });
  app.post("/api/email/register/confirm", async (req, res) => {
    const challenge = await verifiedChallenge(req.body, "register");
    const payload = typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
    const userId = randomUUID();
    let result;
    try {
      result = await transaction(db, async (conn) => {
        await query(conn, "INSERT INTO users(id,username,email,name,password_hash,email_verified_at) VALUES(?,?,?,'用户',?,UTC_TIMESTAMP(3))",
          [userId, payload.username, challenge.email, payload.passwordHash]);
        const [created] = await query(conn, "SELECT user_number FROM users WHERE id=?", [userId]);
        if (Number(created.user_number) > 999999) throw new HttpError(409, "六位用户ID已用完");
        const name = `用户${created.user_number}`;
        await query(conn, "UPDATE users SET name=? WHERE id=?", [name, userId]);
        await service.accountChange(conn, userId, userId, "registered", { username: payload.username, email: challenge.email, userNumber: created.user_number, name });
        const [user] = await query(conn, "SELECT * FROM users WHERE id=?", [userId]);
        return { user, session: await issueCredential(conn, userId, "session", "邮箱注册") };
      });
    } catch (error) { if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "该邮箱已绑定账号"); throw error; }
    appendCookie(res, sessionCookie(result.session.token, req), true);
    res.status(201).json(personalProfile(result.user));
  });
  app.post("/api/email/recover/request", async (req, res) => {
    const data = z.object({ email, password: z.string().min(8).max(200) }).merge(optionalHumanProofInput).parse(req.body);
    const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
    throttleEmail(req, "recover");
    const address = data.email;
    const [account] = await query(db, "SELECT id FROM users WHERE email=? AND disabled_at IS NULL", [address]);
    if (!account) {
      await recordActivity(browserHash, "auth_email_send");
      return res.json({ challengeId: randomUUID(), expiresIn: 600, resendAfter: 60, deliveryStatus: "not_disclosed" });
    }
    const result = await issueChallenge({ purpose: "recover", address, targetUserId: account.id,
      payload: { passwordHash: await hashPassword(data.password) } });
    await recordActivity(browserHash, "auth_email_send");
    res.json(result);
  });
  app.post("/api/email/recover/confirm", async (req, res) => {
    const data = challengeInput.parse(req.body);
    const challenge = await verifiedChallenge(data, "recover");
    const payload = typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
    const result = await transaction(db, async (conn) => {
      await query(conn, "UPDATE users SET password_hash=? WHERE id=?", [payload.passwordHash, challenge.target_user_id]);
      await query(conn, "DELETE FROM credentials WHERE user_id=?", [challenge.target_user_id]);
      await service.accountChange(conn, challenge.target_user_id, challenge.target_user_id, "password_recovered");
      const [user] = await query(conn, "SELECT * FROM users WHERE id=?", [challenge.target_user_id]);
      return { user, session: await issueCredential(conn, user.id, "session", "邮箱找回密码") };
    });
    appendCookie(res, sessionCookie(result.session.token, req), true);
    res.json(personalProfile(result.user));
  });
  app.post("/api/login", async (req, res) => {
    const data = z
      .object({
        identifier: z.string().trim().min(1).max(191).optional(),
        email: z.string().trim().min(1).max(191).optional(),
        password: z.string().min(1).max(200),
        humanChallengeId: z.string().uuid().optional(),
        humanAnswer: z.string().trim().min(1).max(12).optional(),
      })
      .transform((value) => ({ ...value, identifier: (value.identifier || value.email || "").toLowerCase() }))
      .refine((value) => value.identifier, "请输入账号或邮箱")
      .parse(req.body);
    const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.reset <= now) attempts.delete(key);
    const key = req.ip;
    const record = attempts.get(key) || { count: 0, reset: now + 600000 };
    const rateLimited = ++record.count > 20;
    attempts.set(key, record);
    const [user] = await query(db, "SELECT * FROM users WHERE LOWER(username)=? OR LOWER(email)=?", [
      data.identifier, data.identifier,
    ]);
    const failureReason = rateLimited ? "登录尝试过多" : !user ? "账号不存在" : user.disabled_at ? "账号已停用"
      : !(await verifyPassword(data.password, user.password_hash)) ? "密码错误" : null;
    const location = await resolveIpLocation(req.ip);
    await query(db, `INSERT INTO login_logs(id,user_id,email,ip,country,province,city,district,success,failure_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, [randomUUID(), user?.id || null, data.identifier, location.ip, location.country,
      location.province, location.city, location.district, !failureReason, failureReason]);
    if (failureReason) {
      await recordActivity(browserHash, "auth_login_failure");
      throw new HttpError(rateLimited ? 429 : 401, rateLimited ? "登录尝试过多，请 10 分钟后重试" : "邮箱或密码错误");
    }
    attempts.delete(key);
    await clearActivity(browserHash, "auth_login_failure");
    const session = await issueCredential(db, user.id, "session", "浏览器登录");
    appendCookie(res, sessionCookie(session.token, req), true);
    res.json(personalProfile(user));
  });
  app.use(["/api", "/mcp"], async (req, res, next) => {
    req.user = await authenticate(db, req);
    if (!req.user)
      return res.status(401).json({ error: "请先登录，或使用有效的账号令牌" });
    next();
  });
  registerRequestParts(app, db);
  registerConnectorBrowserRoutes(app, db, service);
  app.get("/api/workspace", async (req, res) => {
    const [[profile], projects] = await Promise.all([
      query(db, "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?", [req.user.id]),
      service.projects(req.user),
    ]);
    const selected = projects.find((p) => p.id === req.query.projectId && p.tab_visible)
      || projects.find((p) => p.tab_visible);
    let project = null, thread = null;
    if (selected) {
      [project, thread] = await Promise.all([
        service.project(req.user, selected.id, { display: true }),
        (async () => {
          const [target] = await query(db,
            "SELECT id FROM threads WHERE project_id=? ORDER BY (id=?) DESC,(status='active') DESC,created_at DESC,id LIMIT 1",
            [selected.id, typeof req.query.threadId === "string" ? req.query.threadId.slice(0, 36) : ""]);
          return target ? service.context(req.user, target.id, db, { display: true }) : null;
        })(),
      ]);
    }
    res.json({ user: personalProfile(profile), projects, project, thread,
      health: { status: "ok", database: "mysql", sandbox: makers ? "makers" : "local",
        sandboxConfigured: true, dshEnabled: process.env.DSH_ENABLED !== "false",
        ...(makers ? { agentEndpoint: "/cothread-agent", mcpEndpoint: "/cothread-mcp" } : {}) },
    });
  });
  app.get("/api/me", async (req, res) => {
    const [profile] = await query(db, "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?", [req.user.id]);
    res.json(personalProfile(profile));
  });
  app.post("/api/email/bind/request", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中绑定邮箱");
    const data = z.object({ email }).merge(optionalHumanProofInput).parse(req.body);
    const browserHash = await requireHumanWhenNeeded(req, res, data, "bind");
    throttleEmail(req, "bind");
    const [account] = await query(db, "SELECT email FROM users WHERE id=?", [req.user.id]);
    const [occupied] = await query(db, "SELECT id FROM users WHERE email=? AND id<>?", [data.email, req.user.id]);
    if (occupied) throw new HttpError(409, "该邮箱已绑定其他账号");
    const result = await issueChallenge({ purpose: "bind", address: data.email, targetUserId: req.user.id,
      payload: { previousEmail: account.email } });
    await recordActivity(browserHash, "bind_email_send");
    res.json(result);
  });
  app.post("/api/email/bind/confirm", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中绑定邮箱");
    const challenge = await verifiedChallenge(req.body, "bind", req.user.id);
    const payload = typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
    try {
      await transaction(db, async (conn) => {
        await query(conn, "UPDATE users SET email=?,email_verified_at=UTC_TIMESTAMP(3) WHERE id=?", [challenge.email, req.user.id]);
        await service.accountChange(conn, req.user.id, req.user.id, "email_bound", { before: payload.previousEmail, after: challenge.email });
      });
    } catch (error) { if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "该邮箱已绑定其他账号"); throw error; }
    const [profile] = await query(db, "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?", [req.user.id]);
    res.json(personalProfile(profile));
  });
  app.get("/api/notifications", async (req, res) => res.json(await service.notifications(req.user, req.query.before, req.query)));
  app.post("/api/notifications/read-all", async (req, res) => res.json(await service.readNotification(req.user)));
  app.post("/api/notifications/:id/read", async (req, res) => res.json(await service.readNotification(req.user, req.params.id)));
  app.post("/api/notifications/:id/open", async (req, res) => res.json(await service.openNotification(req.user, req.params.id)));
  app.delete("/api/projects/:id/members/:userId", async (req, res) => res.json(await service.removeMember(req.user, req.params.id, req.params.userId)));
  app.patch("/api/me", async (req, res) => {
    if (req.user.kind !== "session")
      throw new HttpError(403, "请在浏览器中修改个人资料");
    const data = profileSchema.parse(req.body);
    await query(
      db,
      "UPDATE users SET name=?,avatar=?,motto=?,identity_tags=? WHERE id=?",
      [
        data.name,
        data.avatar,
        data.motto,
        JSON.stringify(data.identity_tags),
        req.user.id,
      ],
    );
    await query(db, "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [randomUUID(), req.user.id, req.user.id, "profile_updated", JSON.stringify({ name: data.name, motto: data.motto, identity_tags: data.identity_tags })]);
    res.json(personalProfile({ ...req.user, ...data }));
  });
  app.patch("/api/me/theme", async (req, res) => {
    if (req.user.kind !== "session")
      throw new HttpError(403, "请在浏览器中修改主题");
    const theme = normalizeUiTheme(z.object({
      theme: z.string().refine((value) => UI_THEMES.some((item) => item.id === value), "主题无效"),
    }).parse(req.body).theme);
    await query(db, "UPDATE users SET ui_theme=? WHERE id=?", [theme, req.user.id]);
    const [profile] = await query(db, "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?", [req.user.id]);
    res.json(personalProfile(profile));
  });
  app.post("/api/logout", async (req, res) => {
    await query(db, "DELETE FROM credentials WHERE id=?", [
      req.user.credential_id,
    ]);
    appendCookie(res, sessionCookie("", req));
    res.json({ ok: true });
  });
  app.post("/api/password", async (req, res) => {
    if (req.user.kind !== "session")
      throw new HttpError(403, "请在浏览器中修改密码");
    const data = z
      .object({
        currentPassword: z.string().max(200),
        password: z.string().min(8).max(200),
      })
      .parse(req.body);
    const [user] = await query(
      db,
      "SELECT password_hash FROM users WHERE id=?",
      [req.user.id],
    );
    if (!(await verifyPassword(data.currentPassword, user.password_hash)))
      throw new HttpError(400, "当前密码错误");
    await query(db, "UPDATE users SET password_hash=? WHERE id=?", [
      await hashPassword(data.password),
      req.user.id,
    ]);
    await query(db, "DELETE FROM credentials WHERE user_id=? AND id<>?", [
      req.user.id,
      req.user.credential_id,
    ]);
    await query(db, "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [randomUUID(), req.user.id, req.user.id, "password_changed", JSON.stringify({})]);
    res.json({ ok: true });
  });
  app.get("/api/users", async (req, res) =>
    res.json(await service.users(req.user, req.query.projectId)),
  );
  app.post("/api/users", async (req, res) =>
    res.status(201).json(await service.createUser(req.user, req.body)),
  );
  app.get("/api/admin/projects", async (req, res) =>
    res.json(await service.adminProjects(req.user)),
  );
  app.post("/api/admin/projects", async (req, res) =>
    res.status(201).json(await service.adminCreateProject(req.user, req.body)),
  );
  app.patch("/api/admin/projects/:id/archive", async (req, res) =>
    res.json(await service.setProjectArchived(req.user, req.params.id, true)),
  );
  app.patch("/api/admin/projects/:id/restore", async (req, res) =>
    res.json(await service.setProjectArchived(req.user, req.params.id, false)),
  );
  app.get("/api/admin/accounts", async (req, res) =>
    res.json(await service.adminAccounts(req.user)),
  );
  app.post("/api/admin/accounts", async (req, res) =>
    res.status(201).json(await service.createUser(req.user, req.body)),
  );
  app.patch("/api/admin/accounts/:id/status", async (req, res) =>
    res.json(await service.setAccountDisabled(req.user, req.params.id, req.body)),
  );
  app.post("/api/admin/accounts/:id/reset-password", async (req, res) =>
    res.json(await service.resetAccountPassword(req.user, req.params.id)),
  );
  app.get("/api/admin/plugins", async (req, res) =>
    res.json(await adminPluginManagement(service, req.user)),
  );
  app.post("/api/admin/plugins/skills", async (req, res) =>
    res.status(201).json(await createPromptSkill(service, req.user, req.body)),
  );
  app.patch("/api/admin/plugins/skills/:id", async (req, res) =>
    res.json(await updatePromptSkill(service, req.user, req.params.id, req.body)),
  );
  app.delete("/api/admin/plugins/skills/:id", async (req, res) =>
    res.json(await archivePromptSkill(service, req.user, req.params.id)),
  );
  app.get("/api/projects", async (req, res) =>
    res.json(await service.projects(req.user)),
  );
  app.post("/api/projects", async (req, res) =>
    res.status(201).json(await service.createProject(req.user, req.body)),
  );
  app.get("/api/projects/:id", async (req, res) =>
    res.json(await service.project(req.user, req.params.id, { display: req.query.view === "chat" })),
  );
  app.get("/api/projects/:id/agent-monitor", async (req, res) =>
    res.json(await service.agentMonitor(req.user, req.params.id)),
  );
  app.get("/api/projects/:id/agent-logs", async (req, res) =>
    res.json(await service.agentLogs(req.user, "project", req.params.id, {
      task: req.query.task,
    })),
  );
  app.get("/api/projects/:id/tasks", async (req, res) => {
    await service.member(req.user, req.params.id);
    res.json(await listTasks(db, req.params.id, { status: req.query.status, targetId: req.query.targetId, limit: req.query.limit }));
  });
  app.get("/api/projects/:id/document-changes", async (req, res) => {
    await service.member(req.user, req.params.id);
    res.json(await listDocumentChanges(db, req.params.id, {
      artifactId: req.query.artifactId, folderId: req.query.folderId,
      action: req.query.action, source: req.query.source,
      fileName: req.query.fileName, from: req.query.from, to: req.query.to,
      limit: req.query.limit, page: req.query.page,
      before: req.query.before, beforeId: req.query.beforeId,
    }));
  });
  app.get("/api/projects/:id/document-changes/count", async (req, res) => {
    await service.member(req.user, req.params.id);
    const total = await countDocumentChanges(db, req.params.id, {
      artifactId: req.query.artifactId, folderId: req.query.folderId,
      action: req.query.action, source: req.query.source,
      fileName: req.query.fileName, from: req.query.from, to: req.query.to,
      before: req.query.before, beforeId: req.query.beforeId,
    });
    res.json({ total });
  });
  app.get("/api/tasks/:id", async (req, res) => {
    const task = await getTask(db, req.params.id);
    if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const [assignmentHistory, questions, executionRuns, updates, rejectionReview, statusHistory] = await Promise.all([
      listAssignmentEvents(db, task.id), listTaskQuestions(db, task.id), listTaskExecutionRuns(db, task.id), listTaskUpdates(db, task.id), taskRejectionReview(db, task.id),
      listTaskStatusEvents(db, task.id),
    ]);
    res.json({ ...task, assignmentHistory, questions, executionRuns, updates, rejectionReview, statusHistory, activity: mergeTaskActivity({ updates, statusHistory, executionRuns }) });
  });
  app.get("/api/tasks/:id/agent-logs", async (req, res) =>
    res.json(await service.agentLogs(req.user, "task", req.params.id)),
  );
  app.get("/api/tasks/:id/events/:eventId", async (req, res) =>
    res.json(await service.agentLogEvent(req.user, "task", req.params.id, req.params.eventId)),
  );
  app.get("/api/projects/:id/events/:eventId", async (req, res) =>
    res.json(await service.agentLogEvent(req.user, "project", req.params.id, req.params.eventId)),
  );
  app.get("/api/agent-visual-artifacts/:id", async (req, res) => {
    const [artifact] = await query(db, "SELECT project_id FROM agent_visual_artifacts WHERE id=?", [req.params.id]);
    if (!artifact) throw new HttpError(404, "截图不存在");
    await service.member(req.user, artifact.project_id);
    const image = await readVisualArtifact(db, req.params.id, artifact.project_id);
    if (!image) throw new HttpError(404, "截图不存在");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.type(image.mime).send(image.content);
  });
  app.post("/api/projects/:id/tasks", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await service.member(req.user, req.params.id);
    const data = z.object({ title: z.string().trim().min(1).max(240), goal: z.string().trim().min(1).max(20000),
      constraints: z.string().max(20000).optional(), refs: z.array(z.string().uuid()).max(30).default([]),
      folderRefs: z.array(z.string().uuid()).max(30).default([]),
      targetType: z.enum(["human_member"]).optional(),
      targetUserId: z.string().uuid(), threadId: z.string().uuid().optional() }).parse(req.body);
    if (data.threadId) { const thread = await service.thread(req.user, data.threadId); if (thread.project_id !== req.params.id) throw new HttpError(403, "迭代不属于当前项目"); }
    const task = await createTask(db, { projectId: req.params.id, originThreadId: data.threadId,
      sourceType: "human_member", sourceUserId: req.user.id, sourceMessageId: null, createdByType: "human_member",
      createdById: req.user.id, taskType: "formal", title: data.title, goal: data.goal, constraints: data.constraints,
      documentRefs: data.refs, folderRefs: data.folderRefs, targetType: "human_member", targetId: data.targetUserId });
    res.status(201).json(task);
  });
  app.post("/api/task-questions/:id/answer", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const data = z.object({ answer: z.string().trim().min(1).max(20000), messageId: z.string().uuid().optional() }).parse(req.body);
    const [question] = await query(db, "SELECT source_user_id,task_id FROM agent_task_questions WHERE id=?", [req.params.id]);
    if (!question) throw new HttpError(404, "任务问题不存在");
    const task = await getTask(db, question.task_id); await service.member(req.user, task.project_id);
    const answered = await answerTaskQuestion(db, req.params.id, { type: "human_member", id: req.user.id }, data.answer, data.messageId);
    if (task.origin_thread_id) await service.postMessage(req.user, task.origin_thread_id, {
      body: `@小祥 我已回答任务「${task.title}」的问题：${data.answer}`.slice(0, 20000),
    });
    res.json(answered);
  });
  app.post("/api/tasks/:id/accept", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ mode: z.enum(["auto", "human_direct", "member_connector"]).default("auto") }).parse(req.body);
    const accepted = await acceptTask(db, task.id, { type: "human_member", id: req.user.id }, data.mode);
    await mentionTaskSourceNotice(service, db, req.user, task,
      `任务事件：${req.user.name || "当前成员"}已确认任务「${task.title}」。`);
    res.json(accepted);
  });
  app.post("/api/tasks/:id/reject", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body);
    const rejected = await rejectTask(db, task.id, { type: "human_member", id: req.user.id }, data.reason);
    await mentionTaskSourceNotice(service, db, req.user, task,
      `任务事件：${req.user.name || "当前成员"}拒绝了任务「${task.title}」${data.reason ? `，原因：${data.reason}` : ""}。`);
    res.json(rejected);
  });
  app.post("/api/tasks/:id/cancel", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ reason: z.string().trim().max(1000).optional() }).parse(req.body || {});
    const cancelled = await cancelTask(db, task.id, { type: "human_member", id: req.user.id }, data.reason);
    await mentionTaskSourceNotice(service, db, req.user, task,
      `任务事件：${req.user.name || "当前成员"}取消了任务「${task.title}」。`);
    res.json(cancelled);
  });
  app.post("/api/tasks/:id/acknowledge-rejection", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    res.json(await acknowledgeTaskRejection(db, task.id, { type: "human_member", id: req.user.id }));
  });
  app.post("/api/tasks/:id/reopen", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ title: z.string().trim().min(1).max(240).optional(), goal: z.string().trim().min(1).max(20000).optional(),
      constraints: z.string().max(20000).optional(), reason: z.string().trim().max(1000).optional() }).parse(req.body);
    const reopened = await reopenRejectedTask(db, task.id, { type: "human_member", id: req.user.id }, data);
    await mentionTaskSourceNotice(service, db, req.user, task,
      `任务事件：${req.user.name || "当前成员"}修改并重新发起了任务「${data.title || task.title}」。`);
    res.json(reopened);
  });
  app.patch("/api/tasks/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ status: z.enum(["pending_start","running","waiting","blocked","completed","failed","cancelled","abandoned"]).optional(), progress: z.string().max(500).optional(), resultSummary: z.string().max(20000).optional(), artifactRefs: z.array(z.unknown()).optional(), body: z.string().max(20000).optional(), messageId: z.string().uuid().optional() }).parse(req.body);
    const updated = await updateTask(db, task.id, { type: "human_member", id: req.user.id }, data);
    if (data.status && data.status !== task.status)
      await mentionTaskSourceNotice(service, db, req.user, task,
        `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」更新为${taskStatusLabel(data.status)}。${data.resultSummary || data.progress || ""}`.trim());
    res.json(updated);
  });
  app.post("/api/tasks/:id/reassign", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    const task = await getTask(db, req.params.id); if (!task) throw new HttpError(404, "任务不存在");
    await service.member(req.user, task.project_id);
    const data = z.object({ targetType: z.enum(["human_member", "l2_session"]).default("human_member"), targetUserId: z.string().uuid().optional(), reason: z.string().trim().max(1000).optional(), messageId: z.string().uuid().optional() }).parse(req.body);
    let targetId = data.targetUserId;
    if (data.targetType === "l2_session") {
      if (!task.origin_thread_id) throw new HttpError(409, "项目级任务需要先关联迭代才能转给 L2");
      await query(db, "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,UUID())", [task.origin_thread_id]);
      targetId = (await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [task.origin_thread_id]))[0]?.session_id;
    }
    if (!targetId) throw new HttpError(400, "请选择任务目标");
    const reassigned = await reassignTask(db, task.id, { type: "human_member", id: req.user.id }, { type: data.targetType, id: targetId }, data.reason, data.messageId);
    if (task.origin_thread_id) {
      const targetName = data.targetType === "l2_session" ? "小祥" : (await query(db, "SELECT name FROM users WHERE id=?", [targetId]))[0]?.name || "另一位成员";
      const body = `任务事件：${req.user.name || "当前成员"}将任务「${task.title}」转交给${targetName}${data.reason ? `，原因：${data.reason}` : ""}。`;
      const mentioned = withTaskSourceMention(await taskSourceMentionToken(db, task), body);
      if (data.targetType === "l2_session") await service.postMessage(req.user, task.origin_thread_id, { body: `@小祥 ${mentioned}` });
      else await mentionTaskSourceNotice(service, db, req.user, task, body);
    }
    res.json(reassigned);
  });
  app.patch("/api/projects/:id", async (req, res) =>
    res.json(await service.updateProject(req.user, req.params.id, req.body)),
  );
  app.patch("/api/projects/:id/tab", async (req, res) =>
    res.json(await service.updateProjectTab(req.user, req.params.id, req.body)),
  );
  app.patch("/api/project-tabs/order", async (req, res) =>
    res.json(await service.reorderProjectTabs(req.user, req.body)),
  );
  app.patch("/api/projects/:id/versions/:versionId", async (req,res) =>
    res.json(await libraryChange(service,req.user,req.params.id,"version",req.params.versionId,req.body)));
  app.patch("/api/projects/:id/artifacts/:artifactId", async (req, res) =>
    res.json(
      await libraryChange(
        service,
        req.user,
        req.params.id,
        "artifact",
        req.params.artifactId,
        req.body,
      ),
    ),
  );
  app.post("/api/projects/:id/documents/upload", async (req, res) =>
    res.status(201).json(await service.uploadOfficialDocument(req.user, req.params.id, req.body)));
  app.post("/api/file-uploads", async (req, res) =>
    res.status(201).json(await startFileUpload(service, req.user, req.body)));
  app.post("/api/file-uploads/:id/chunks", async (req, res) =>
    res.json(await putFileUploadChunk(service, req.user, req.params.id, req.body)));
  app.post("/api/file-uploads/:id/complete", async (req, res) =>
    res.status(201).json(await completeFileUpload(service, req.user, req.params.id, req.body)));
  app.post("/api/projects/:id/folders", async (req, res) =>
    res.status(201).json(await libraryChange(service, req.user, req.params.id, "folder", null, req.body)));
  app.patch("/api/projects/:id/folders/:folderId", async (req, res) =>
    res.json(await libraryChange(service, req.user, req.params.id, "folder", req.params.folderId, req.body)));
  app.delete("/api/projects/:id/folders/:folderId", async (req, res) =>
    res.json(await libraryChange(service, req.user, req.params.id, "remove-folder", req.params.folderId, {})));
  app.post("/api/projects/:id/documents/organize", async (req, res) =>
    res.status(202).json(await queueDocumentOrganization(service, req.user, { projectId: req.params.id })));
  app.post("/api/projects/:id/recycle/empty", async (req, res) =>
    res.json(await emptyLibraryRecycle(service, req.user, req.params.id)));
  app.post("/api/projects/:id/member-memory", async (req, res) =>
    res.status(202).json(await queueL1MemoryRun(service, req.user, { projectId: req.params.id, task: "member_memory" })));
  app.post("/api/projects/:id/document-memory", async (req, res) =>
    res.status(202).json(await queueL1MemoryRun(service, req.user, { projectId: req.params.id, task: "document_memory" })));
  app.post("/api/projects/:id/project-document-memory", async (req, res) =>
    res.status(202).json(await queueL1MemoryRun(service, req.user, { projectId: req.params.id, task: "document_memory" })));
  app.post("/api/projects/:id/iteration-document-memory", async (req, res) =>
    res.status(202).json(await queueL1MemoryRun(service, req.user, { projectId: req.params.id, task: "document_memory" })));
  app.post("/api/projects/:id/iteration-archive", async (req, res) =>
    res.status(202).json(await queueL1MemoryRun(service, req.user, {
      projectId: req.params.id, task: "iteration_archive", threadId: req.body?.threadId,
    })));
  app.get("/api/projects/:id/l1-sessions/:task", async (req, res) =>
    res.json(await readL1TaskSession(service, req.user, req.params.id, req.params.task)));
  app.post("/api/projects/:id/l1-context/compact", async (req, res) =>
    res.status(202).json(await queueL1ContextCompression(service, req.user, req.params.id, req.body?.task)));
  app.post("/api/projects/:id/members", async (req, res) =>
    res
      .status(201)
      .json(await service.addMember(req.user, req.params.id, req.body)),
  );
  app.post("/api/projects/:id/threads", async (req, res) =>
    res
      .status(201)
      .json(await service.createThread(req.user, req.params.id, req.body)),
  );
  app.get("/api/threads/:id", async (req, res) =>
    res.json(await service.context(req.user, req.params.id, db, { display: req.query.view === "chat", limit: req.query.limit, before: req.query.before, after: req.query.after })),
  );
  app.get("/api/threads/:id/agent-logs", async (req, res) =>
    res.json(await service.agentLogs(req.user, "thread", req.params.id)),
  );
  app.get("/api/threads/:id/events/:eventId", async (req, res) => {
    await service.thread(req.user, req.params.id, false, db, { display: true });
    const eventId = z.string().regex(/^\d+$/).parse(req.params.eventId);
    const [event] = await query(db,
      `SELECT e.* FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE e.id=? AND m.thread_id=?`, [eventId, req.params.id]);
    if (!event) throw new HttpError(404, "执行记录不存在");
    res.json(event);
  });
  app.get("/api/projects/:id/members/:userId/avatar", async (req, res) => {
    await service.member(req.user, req.params.id);
    const [member] = await query(db,
      "SELECT u.avatar FROM users u JOIN members m ON m.user_id=u.id WHERE m.project_id=? AND u.id=?", [req.params.id, req.params.userId]);
    const image = member?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/threads/:id/replies/:messageId/activity", async (req,res) => {
    await service.thread(req.user,req.params.id);
    const first = req.query.view === 'first';
    const rows=await query(db,`SELECT e.id,e.tool,LEFT(e.output,32000) output FROM agent_events e JOIN messages m ON m.id=e.message_id
      WHERE m.thread_id=? AND e.message_id=? AND e.tool IN ('thinking','assistant_text','assistant_final') ${first ? "AND LENGTH(e.output)>0" : ""} ORDER BY e.id LIMIT ${first ? 1 : 200}`,[req.params.id,req.params.messageId]);
    let remaining=240000;
    res.json(rows.map(row=>{const output=(row.output||'').slice(0,remaining);remaining-=output.length;return {...row,output};}));
  });
  app.get("/api/threads/:id/live", (req,res) => streamLiveOutput(service,req.user,req.params.id,req,res));
  app.get("/api/threads/:id/messages/:messageId", async (req, res) =>
    res.json(await service.readMessage(req.user, req.params.id, req.params.messageId)));
  app.post("/api/threads/:id/messages", async (req, res) =>
    res
      .status(201)
      .json(await service.postMessage(req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/attachments", async (req, res) =>
    res
      .status(201)
      .json(
        await service.submitVersion(
          req.user,
          req.params.id,
          req.body,
          undefined,
          undefined,
          true,
        ),
      ),
  );
  app.post("/api/threads/:id/versions/:versionId/save-to-project", async (req, res) =>
    res.status(201).json(await service.copyVersionToOfficial(req.user, req.params.id, req.params.versionId)));
  app.post("/api/projects/:id/versions/:versionId/save-to-official", async (req, res) =>
    res.status(201).json(await service.saveVersionToOfficial(req.user, req.params.id, req.params.versionId, req.body)));
  app.post("/api/threads/:id/archive", async (req, res) =>
    res.json(await service.archive(req.user, req.params.id, req.body)),
  );
  app.post("/api/versions/:id/reviews", async (req, res) =>
    res
      .status(201)
      .json(await service.review(req.user, req.params.id, req.body)),
  );
  app.get("/api/versions/:id/preview-data", async (req, res) => {
    const version = await service.version(req.user, req.params.id);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ filename: version.filename, mime: version.mime, contentBase64: version.content.toString("base64") });
  });
  app.get("/api/versions/:id/download", async (req, res) => {
    const version = await service.version(req.user, req.params.id);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(version.filename)}`,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(version.content);
  });
  app.get("/api/projects/:id/folders/:folderId/download", async (req, res) => {
    const archive = await service.folderArchive(req.user, req.params.id, req.params.folderId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
    );
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(archive.content.length));
    res.send(archive.content);
  });
  const sendVersionPreview = async (req, res) => {
    let assetPath = req.params.assetPath || "";
    if (Array.isArray(assetPath)) assetPath = assetPath.join("/");
    assetPath = decodeURIComponent(String(assetPath));
    const file = await service.versionPreview(
      req.user,
      req.params.id,
      assetPath,
    );
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(file.content);
  };
  app.get("/api/versions/:id/source", async (req, res) => {
    const file = await service.versionSource(req.user, req.params.id);
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.content);
  });
  app.get("/api/versions/:id/preview", sendVersionPreview);
  app.get("/api/versions/:id/preview/", sendVersionPreview);
  app.get("/api/versions/:id/preview/*assetPath", sendVersionPreview);
  app.get("/api/versions/:id", async (req, res) => {
    const { content, ...meta } = await service.version(req.user, req.params.id);
    res.json(req.query.metadata === "1" ? meta : { ...meta, contentBase64: content.toString("base64") });
  });
  app.get("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const rows = await query(db, "SELECT id,label,project_id,expires_at,token_ciphertext FROM credentials WHERE user_id=? AND kind='api' ORDER BY created_at DESC", [req.user.id]);
    res.json(await Promise.all(rows.map(async ({ token_ciphertext, ...row }) => ({ ...row, token: token_ciphertext ? await decryptToken(token_ciphertext, req.user.id) : null }))));
  });
  const mcpCredentialResponse = (credential) => ({
    token: credential.token,
    expiresAt: credential.expiresAt,
    version: credential.version,
    endpoint: makers ? "/cothread-mcp" : "/mcp",
    capabilities: MCP_CAPABILITIES,
  });
  app.get("/api/mcp/credential", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(mcpCredentialResponse(await accountCredential(db, req.user.id)));
  });
  app.post("/api/mcp/credential/reset", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(mcpCredentialResponse(await accountCredential(db, req.user.id, true)));
  });
  app.post("/api/tokens/ensure", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(await accountCredential(db, req.user.id));
  });
  app.post("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const credential = await accountCredential(db, req.user.id, true);
    res.status(201).json(credential);
  });
  app.delete("/api/tokens/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await query(
      db,
      "DELETE FROM credentials WHERE id=? AND user_id=? AND kind='api'",
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  });
  app.post("/api/threads/:id/runs", async (req, res) =>
    res.json(await (executeRun || (() => { throw new HttpError(503, "请刷新页面后使用云端执行入口"); }))(service, req.user, req.params.id, req.body)),
  );
  app.post("/api/threads/:id/summary", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要人工登录");
    const message = await service.postMessage(req.user, req.params.id, {
      body: SUMMARY_REQUEST,
    });
    res.status(202).json({ ...message, status: "queued" });
  });
  app.post("/api/threads/:id/context/compact", async (req, res) => {
    res
      .status(202)
      .json(await queueContextCompression(service, req.user, req.params.id));
  });
  app.get("/api/threads/:id/replies/:messageId/session", async (req, res) =>
    res.json(await readL3TaskSession(service, req.user, req.params.id, req.params.messageId)));
  app.post("/api/threads/:id/replies/:messageId/session", async (req, res) =>
    res.status(202).json(await appendL3TaskSession(service, req.user, req.params.id, req.params.messageId, req.body?.body)));
  app.post("/api/threads/:id/replies/:messageId/context/compact", async (req, res) =>
    res.status(202).json(await queueL3ContextCompression(service, req.user, req.params.id, req.params.messageId)));
  app.post("/api/threads/:id/replies/:messageId/retry", async (req, res) =>
    res.json(
      await retryReply(service, req.user, req.params.id, req.params.messageId),
    ),
  );
  app.post("/api/threads/:id/replies/:messageId/stop", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要人工登录");
    await transaction(db, async (conn) => {
      await service.thread(req.user, req.params.id, true, conn);
      const result = await query(
        conn,
        `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id SET r.status='cancelled',r.error='已停止',r.finished_at=UTC_TIMESTAMP(3) WHERE r.message_id=? AND m.thread_id=? AND r.status IN ('running','queued')`,
        [req.params.messageId, req.params.id],
      );
      if (!result.affectedRows) throw new HttpError(409, "任务已结束");
      await query(conn,
        `UPDATE agent_requests q LEFT JOIN agent_task_updates u ON u.message_id=q.message_id
         SET q.status='completed' WHERE (q.message_id=? OR u.task_message_id=?) AND q.status IN ('queued','running')`,
        [req.params.messageId, req.params.messageId]);
    });
    await stopAgent(db, req.params.id, req.params.messageId);
    res.json({ ok: true });
  });
  app.post("/mcp", async (req, res) => {
    if (req.user.kind !== "api") throw new HttpError(403, "MCP 需要账号令牌");
    await handleMcp(req, res, service, afterMcpMessage);
  });
  app.all("/mcp", (req, res) =>
    res.status(405).json({ error: "使用无状态 Streamable HTTP POST" }),
  );
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof ZodError
        ? 400
        : error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
    if (status === 500)
      console.error("Request failed", { code: error.code || error.name });
    res.status(status).json({
      error:
        error instanceof ZodError
          ? error.issues
              .map((x) => `${x.path.join(".")}: ${x.message}`)
              .join(";")
          : status === 500
            ? "服务暂时不可用，请检查数据库连接"
            : error.code === "ER_DUP_ENTRY"
              ? "记录已存在"
              : error.message,
    });
  });
  return app;
}

