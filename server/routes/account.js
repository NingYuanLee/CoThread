/**
 * 账号与登录域：注册/找回/绑定邮箱、登录与人机验证、会话切换、个人资料与通知、退出与改密。
 * 工厂把共享的限流表、Cookie 帮助函数与验证码流程收在一个闭包里，
 * 公开路由与需登录路由分两次注册，鉴权中间件仍由 http-app 在两者之间挂载。
 */
import { z } from "zod/v3";
import { verifyPassword, issueCredential, hashPassword } from "../auth.js";
import { query, transaction } from "../db.js";
import { HttpError } from "../service.js";
import { personalProfile, profileSchema } from "../profile.js";
import {
  clearUserSkillSecret,
  listUserSkills,
  saveUserSkillSecret,
} from "../user-skill-credentials.js";
import {
  clearEnvironmentVariable,
  listEnvironmentVariables,
  readEnvironmentRemark,
  setEnvironmentVariable,
} from "../environment-variables.js";
import { loginLanding } from "../org-shelf.js";
import { UI_THEMES, normalizeUiTheme } from "../../shared/ui-theme.js";
import { resolveIpLocation } from "../ip-location.js";
import { randomUUID } from "node:crypto";
import { randomInt } from "node:crypto";
import { digest } from "../auth.js";
import { sweepExpired, touchWindow } from "../rate-window.js";
import { isProductionProcess, requestIsHttps } from "../runtime-config.js";

export function createAccountSurface({ db, service, sendVerificationEmail, createHumanChallenge }) {
  const attempts = new Map();
  const emailAttempts = new Map();
  const humanChallengeAttempts = new Map();
  const sessionCookie = (token, req) =>
    `cothread_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${requestIsHttps(req) ? "; Secure" : ""}`;
  const appendCookie = (res, value, first = false) => {
    const current = res.getHeader("Set-Cookie");
    const values = current ? (Array.isArray(current) ? current : [current]) : [];
    res.setHeader("Set-Cookie", first ? [value, ...values] : [...values, value]);
  };
  const cookieValue = (req, name) =>
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  const browserIdentity = (req, res) => {
    let id = cookieValue(req, "cothread_browser");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
      id = randomUUID();
      appendCookie(
        res,
        `cothread_browser=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${requestIsHttps(req) ? "; Secure" : ""}`,
      );
    }
    return digest(id);
  };
  const email = z
    .string()
    .email()
    .max(191)
    .transform((value) => value.toLowerCase());
  const challengeInput = z.object({
    challengeId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  });
  const humanProofInput = z.object({
    humanChallengeId: z.string().uuid(),
    humanAnswer: z.string().trim().min(1).max(12),
  });
  const optionalHumanProofInput = z.object({
    humanChallengeId: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().uuid().optional(),
    ),
    humanAnswer: z.preprocess(
      (value) => (typeof value === "string" && !value.trim() ? undefined : value),
      z.string().trim().min(1).max(12).optional(),
    ),
  });
  const throttleEmail = (req, purpose) => {
    const record = touchWindow(emailAttempts, `${req.ip}:${purpose}`, Date.now(), 600_000);
    if (record.count > 5) throw new HttpError(429, "验证码发送过于频繁，请稍后重试");
  };
  const issueChallenge = async ({ purpose, address, targetUserId = null, payload = {} }) => {
    const [recent] = await query(
      db,
      `SELECT GREATEST(1,60-TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP(3))) retry_after
      FROM email_challenges WHERE email=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND)
      ORDER BY created_at DESC LIMIT 1`,
      [address],
    );
    if (recent) throw new HttpError(429, `请在 ${Number(recent.retry_after)} 秒后重新发送`);
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    await query(
      db,
      "UPDATE email_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE purpose=? AND email=? AND consumed_at IS NULL",
      [purpose, address],
    );
    await query(
      db,
      `INSERT INTO email_challenges(id,purpose,email,target_user_id,code_hash,payload,expires_at)
      VALUES(?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,
      [
        challengeId,
        purpose,
        address,
        targetUserId,
        digest(`${challengeId}:${code}`),
        JSON.stringify(payload),
      ],
    );
    try {
      await sendVerificationEmail({ email: address, code, purpose });
    } catch (error) {
      await query(db, "DELETE FROM email_challenges WHERE id=?", [challengeId]);
      throw new HttpError(503, error instanceof Error ? error.message : "验证码发送失败");
    }
    const localDev = !isProductionProcess();
    if (localDev) console.log(`本机验证码 [${purpose}] ${address}: ${code}`);
    return {
      challengeId,
      expiresIn: 600,
      resendAfter: 60,
      deliveryStatus: "accepted",
      ...(localDev && process.env.COTHREAD_DEV_ECHO_CODE === "1" ? { devCode: code } : {}),
    };
  };
  const recentActivityCount = async (browserHash, kind) => {
    const [row] = await query(
      db,
      `SELECT COUNT(*) count FROM human_verification_activity
      WHERE browser_hash=? AND kind=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)`,
      [browserHash, kind],
    );
    return Number(row.count);
  };
  const verificationRequired = async (browserHash, scope) =>
    scope === "auth"
      ? (await recentActivityCount(browserHash, "auth_email_send")) >= 3 ||
        (await recentActivityCount(browserHash, "auth_login_failure")) >= 3
      : (await recentActivityCount(browserHash, "bind_email_send")) >= 3;
  const recordActivity = (browserHash, kind) =>
    query(db, "INSERT INTO human_verification_activity(id,browser_hash,kind) VALUES(?,?,?)", [
      randomUUID(),
      browserHash,
      kind,
    ]);
  const clearActivity = (browserHash, kind) =>
    query(db, "DELETE FROM human_verification_activity WHERE browser_hash=? AND kind=?", [
      browserHash,
      kind,
    ]);
  const verifyHuman = async (req, res, input, purpose) => {
    const proof = humanProofInput.parse(input);
    const browserHash = browserIdentity(req, res);
    const accepted = await transaction(db, async (conn) => {
      const [challenge] = await query(
        conn,
        "SELECT * FROM human_verification_challenges WHERE id=? FOR UPDATE",
        [proof.humanChallengeId],
      );
      if (
        !challenge ||
        challenge.purpose !== purpose ||
        challenge.request_ip_hash !== browserHash ||
        challenge.consumed_at ||
        challenge.expires_at <= new Date() ||
        challenge.attempts >= 5
      )
        return false;
      if (challenge.answer_hash !== digest(`${challenge.id}:${proof.humanAnswer.toLowerCase()}`)) {
        await query(
          conn,
          "UPDATE human_verification_challenges SET attempts=attempts+1 WHERE id=?",
          [challenge.id],
        );
        return false;
      }
      await query(
        conn,
        "UPDATE human_verification_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?",
        [challenge.id],
      );
      return true;
    });
    if (!accepted) throw new HttpError(400, "人类验证码无效或已过期，请刷新后重试");
  };
  const requireHumanWhenNeeded = async (req, res, input, scope) => {
    const browserHash = browserIdentity(req, res);
    if (await verificationRequired(browserHash, scope)) {
      if (!input.humanChallengeId || !input.humanAnswer)
        throw new HttpError(400, "请先完成人类验证");
      await verifyHuman(req, res, input, scope);
    }
    return browserHash;
  };
  const verifiedChallenge = async (input, purpose, targetUserId) => {
    const data = challengeInput.parse(input);
    const result = await transaction(db, async (conn) => {
      const [challenge] = await query(
        conn,
        "SELECT * FROM email_challenges WHERE id=? FOR UPDATE",
        [data.challengeId],
      );
      if (
        !challenge ||
        challenge.purpose !== purpose ||
        challenge.consumed_at ||
        challenge.expires_at <= new Date() ||
        challenge.attempts >= 5 ||
        (targetUserId && challenge.target_user_id !== targetUserId)
      )
        return null;
      if (challenge.code_hash !== digest(`${challenge.id}:${data.code}`)) {
        await query(conn, "UPDATE email_challenges SET attempts=attempts+1 WHERE id=?", [
          challenge.id,
        ]);
        return null;
      }
      await query(conn, "UPDATE email_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE id=?", [
        challenge.id,
      ]);
      return challenge;
    });
    if (!result) throw new HttpError(400, "验证码无效或已过期");
    return result;
  };
  return {
    registerPublicRoutes(app) {
      app.get("/api/human-verification/status", async (req, res) => {
        const scope = z.enum(["auth", "bind"]).parse(req.query.scope);
        res.json({ required: await verificationRequired(browserIdentity(req, res), scope) });
      });
      app.get("/api/human-verification", async (req, res) => {
        const purpose = z.enum(["auth", "bind"]).parse(req.query.purpose);
        const browserHash = browserIdentity(req, res);
        const record = touchWindow(humanChallengeAttempts, req.ip, Date.now(), 600_000);
        if (record.count > 30) throw new HttpError(429, "人类验证请求过于频繁，请稍后重试");
        const challengeId = randomUUID();
        const challenge = createHumanChallenge();
        await query(
          db,
          "DELETE FROM human_verification_challenges WHERE expires_at<UTC_TIMESTAMP(3) OR created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)",
        );
        await query(
          db,
          `INSERT INTO human_verification_challenges(id,purpose,answer_hash,request_ip_hash,expires_at)
      VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))`,
          [
            challengeId,
            purpose,
            digest(`${challengeId}:${challenge.text.toLowerCase()}`),
            browserHash,
          ],
        );
        res.json({
          challengeId,
          image: `data:image/svg+xml;base64,${Buffer.from(challenge.data).toString("base64")}`,
          expiresIn: 300,
        });
      });
      app.post("/api/email/register/request", async (req, res) => {
        const data = z
          .object({ email, password: z.string().min(8).max(200) })
          .merge(optionalHumanProofInput)
          .parse(req.body);
        const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
        throttleEmail(req, "register");
        if (
          (
            await query(db, "SELECT id FROM users WHERE email=? OR username=?", [
              data.email,
              data.email,
            ])
          ).length
        )
          throw new HttpError(409, "该邮箱已存在账号");
        const result = await issueChallenge({
          purpose: "register",
          address: data.email,
          payload: { username: data.email, passwordHash: await hashPassword(data.password) },
        });
        await recordActivity(browserHash, "auth_email_send");
        res.json(result);
      });
      app.post("/api/email/register/confirm", async (req, res) => {
        const challenge = await verifiedChallenge(req.body, "register");
        const payload =
          typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
        const userId = randomUUID();
        let result;
        try {
          result = await transaction(db, async (conn) => {
            await query(
              conn,
              "INSERT INTO users(id,username,email,name,password_hash,email_verified_at) VALUES(?,?,?,'用户',?,UTC_TIMESTAMP(3))",
              [userId, payload.username, challenge.email, payload.passwordHash],
            );
            const [created] = await query(conn, "SELECT user_number FROM users WHERE id=?", [
              userId,
            ]);
            if (Number(created.user_number) > 999999) throw new HttpError(409, "六位用户ID已用完");
            const name = `用户${created.user_number}`;
            await query(conn, "UPDATE users SET name=? WHERE id=?", [name, userId]);
            await service.accountChange(conn, userId, userId, "registered", {
              username: payload.username,
              email: challenge.email,
              userNumber: created.user_number,
              name,
            });
            const [user] = await query(conn, "SELECT * FROM users WHERE id=?", [userId]);
            return { user, session: await issueCredential(conn, userId, "session", "邮箱注册") };
          });
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "该邮箱已绑定账号");
          throw error;
        }
        appendCookie(res, sessionCookie(result.session.token, req), true);
        res
          .status(201)
          .json({ ...personalProfile(result.user), sessionToken: result.session.token });
      });
      app.post("/api/email/recover/request", async (req, res) => {
        const data = z
          .object({ email, password: z.string().min(8).max(200) })
          .merge(optionalHumanProofInput)
          .parse(req.body);
        const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
        throttleEmail(req, "recover");
        const address = data.email;
        const [account] = await query(
          db,
          "SELECT id FROM users WHERE email=? AND disabled_at IS NULL",
          [address],
        );
        if (!account) {
          await recordActivity(browserHash, "auth_email_send");
          return res.json({
            challengeId: randomUUID(),
            expiresIn: 600,
            resendAfter: 60,
            deliveryStatus: "not_disclosed",
          });
        }
        const result = await issueChallenge({
          purpose: "recover",
          address,
          targetUserId: account.id,
          payload: { passwordHash: await hashPassword(data.password) },
        });
        await recordActivity(browserHash, "auth_email_send");
        res.json(result);
      });
      app.post("/api/email/recover/confirm", async (req, res) => {
        const data = challengeInput.parse(req.body);
        const challenge = await verifiedChallenge(data, "recover");
        const payload =
          typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
        const result = await transaction(db, async (conn) => {
          await query(conn, "UPDATE users SET password_hash=? WHERE id=?", [
            payload.passwordHash,
            challenge.target_user_id,
          ]);
          await query(conn, "DELETE FROM credentials WHERE user_id=?", [challenge.target_user_id]);
          await service.accountChange(
            conn,
            challenge.target_user_id,
            challenge.target_user_id,
            "password_recovered",
          );
          const [user] = await query(conn, "SELECT * FROM users WHERE id=?", [
            challenge.target_user_id,
          ]);
          return { user, session: await issueCredential(conn, user.id, "session", "邮箱找回密码") };
        });
        appendCookie(res, sessionCookie(result.session.token, req), true);
        res.json({ ...personalProfile(result.user), sessionToken: result.session.token });
      });
      app.post("/api/login", async (req, res) => {
        const data = z
          .object({
            identifier: z.string().trim().min(1).max(191).optional(),
            email: z.string().trim().min(1).max(191).optional(),
            password: z.string().min(1).max(200),
            humanChallengeId: z.string().uuid().optional(),
            humanAnswer: z.string().trim().min(1).max(12).optional(),
            remember: z.boolean().optional(),
          })
          .transform((value) => ({
            ...value,
            identifier: (value.identifier || value.email || "").toLowerCase(),
          }))
          .refine((value) => value.identifier, "请输入用户名或邮箱")
          .parse(req.body);
        const browserHash = await requireHumanWhenNeeded(req, res, data, "auth");
        const now = Date.now();
        sweepExpired(attempts, now);
        const key = req.ip;
        const record = attempts.get(key) || { count: 0, reset: now + 600000 };
        const rateLimited = ++record.count > 20;
        attempts.set(key, record);
        const [user] = await query(
          db,
          "SELECT * FROM users WHERE LOWER(username)=? OR LOWER(email)=?",
          [data.identifier, data.identifier],
        );
        const failureReason = rateLimited
          ? "登录尝试过多"
          : !user
            ? "账号不存在"
            : user.disabled_at
              ? "账号已停用"
              : !(await verifyPassword(data.password, user.password_hash))
                ? "密码错误"
                : null;
        const location = await resolveIpLocation(db, req.ip);
        await query(
          db,
          `INSERT INTO login_logs(id,user_id,email,ip,country,province,city,district,success,failure_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            randomUUID(),
            user?.id || null,
            data.identifier,
            location.ip,
            location.country,
            location.province,
            location.city,
            location.district,
            !failureReason,
            failureReason,
          ],
        );
        if (failureReason) {
          await recordActivity(browserHash, "auth_login_failure");
          throw new HttpError(
            rateLimited ? 429 : 401,
            rateLimited ? "登录尝试过多，请 10 分钟后重试" : "邮箱或密码错误",
          );
        }
        attempts.delete(key);
        await clearActivity(browserHash, "auth_login_failure");
        const session = await issueCredential(db, user.id, "session", "浏览器登录");
        if (data.remember) {
          await query(
            db,
            "INSERT INTO browser_accounts(browser_hash,user_id,last_login_at) VALUES(?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE last_login_at=UTC_TIMESTAMP(3)",
            [browserHash, user.id],
          );
        } else {
          await query(db, "DELETE FROM browser_accounts WHERE browser_hash=? AND user_id=?", [
            browserHash,
            user.id,
          ]);
        }
        appendCookie(res, sessionCookie(session.token, req), true);
        res.json({ ...personalProfile(user), sessionToken: session.token });
      });
      app.post("/api/session/switch", async (req, res) => {
        const data = z.object({ token: z.string().trim().min(20).max(200) }).parse(req.body);
        const [row] = await query(
          db,
          "SELECT u.id,u.user_number,u.username,u.name,u.email,u.avatar,u.motto,u.identity_tags,u.is_super_admin,u.ui_theme,c.kind FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.token_hash=? AND c.expires_at>UTC_TIMESTAMP(3) AND u.disabled_at IS NULL",
          [digest(data.token)],
        );
        if (!row || row.kind !== "session")
          throw new HttpError(401, "该账号登录已过期，请重新登录");
        appendCookie(res, sessionCookie(data.token, req), true);
        res.json(personalProfile(row));
      });
      app.get("/api/session/known-accounts", async (req, res) => {
        const browserHash = browserIdentity(req, res);
        const rows = await query(
          db,
          "SELECT u.id,u.user_number,u.username,u.name,u.email,u.avatar,u.motto,u.identity_tags,u.is_super_admin,u.ui_theme FROM users u JOIN browser_accounts b ON b.user_id=u.id WHERE b.browser_hash=? AND u.disabled_at IS NULL ORDER BY b.last_login_at DESC",
          [browserHash],
        );
        res.json(rows.map((row) => personalProfile(row)));
      });
      app.post("/api/session/detach", async (req, res) => {
        appendCookie(res, sessionCookie("", req));
        res.json({ ok: true });
      });
      app.post("/api/session/forget", async (req, res) => {
        const browserHash = browserIdentity(req, res);
        const data = z.object({ userId: z.string().uuid() }).parse(req.body);
        await query(db, "DELETE FROM browser_accounts WHERE browser_hash=? AND user_id=?", [
          browserHash,
          data.userId,
        ]);
        res.json({ ok: true });
      });
    },
    registerRoutes(app) {
      app.get("/api/workspace", async (req, res) => {
        const [[profile], projects] = await Promise.all([
          query(
            db,
            "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
            [req.user.id],
          ),
          service.projects(req.user),
        ]);
        const selected =
          projects.find((p) => p.id === req.query.projectId && p.tab_visible) ||
          projects.find((p) => p.tab_visible);
        let project = null,
          thread = null;
        if (selected) {
          [project, thread] = await Promise.all([
            service.project(req.user, selected.id, { display: true }),
            (async () => {
              const [target] = await query(
                db,
                "SELECT id FROM threads WHERE project_id=? ORDER BY (id=?) DESC,(status='active') DESC,created_at DESC,id LIMIT 1",
                [
                  selected.id,
                  typeof req.query.threadId === "string" ? req.query.threadId.slice(0, 36) : "",
                ],
              );
              return target
                ? service.context(req.user, target.id, db, {
                    display: true,
                    includeConnectorResults: false,
                    includeRunResults: false,
                  })
                : null;
            })(),
          ]);
        }
        res.json({
          user: personalProfile(profile),
          projects,
          project,
          thread,
          health: {
            status: "ok",
            database: "mysql",
            sandbox: "local",
            sandboxConfigured: true,
            dshEnabled: process.env.DSH_ENABLED !== "false",
            mcpEndpoint: "/mcp",
          },
        });
      });
      app.get("/api/me", async (req, res) => {
        const [profile] = await query(
          db,
          "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
          [req.user.id],
        );
        res.json(personalProfile(profile));
      });
      app.get("/api/me/environment-variables", async (req, res) => {
        res.json({
          variables: await listEnvironmentVariables(db, "personal", req.user.id),
        });
      });
      app.get("/api/me/environment-variables/:key/remark", async (req, res) => {
        res.json({ markdown: await readEnvironmentRemark("personal", req.params.key) });
      });
      app.put("/api/me/environment-variables/:key", async (req, res) => {
        const data = z.object({ value: z.string().max(4000) }).parse(req.body);
        await setEnvironmentVariable(
          db,
          "personal",
          req.user.id,
          req.params.key,
          data.value,
          req.user.id,
        );
        res.json({ configured: true });
      });
      app.delete("/api/me/environment-variables/:key", async (req, res) => {
        await clearEnvironmentVariable(db, "personal", req.user.id, req.params.key);
        res.json({ configured: false });
      });
      app.get("/api/me/skills", async (req, res) => {
        res.json({ skills: await listUserSkills(db, req.user.id) });
      });
      app.put("/api/me/skills/:skillKey", async (req, res) => {
        const data = z.object({ token: z.string().max(200) }).parse(req.body);
        await saveUserSkillSecret(db, req.user.id, req.params.skillKey, data.token);
        res.json({ configured: true });
      });
      app.delete("/api/me/skills/:skillKey", async (req, res) => {
        await clearUserSkillSecret(db, req.user.id, req.params.skillKey);
        res.json({ configured: false });
      });
      app.get("/api/me/landing", async (req, res) => {
        res.json(await loginLanding(db, req.user));
      });
      app.post("/api/email/bind/request", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中绑定邮箱");
        const data = z.object({ email }).merge(optionalHumanProofInput).parse(req.body);
        const browserHash = await requireHumanWhenNeeded(req, res, data, "bind");
        throttleEmail(req, "bind");
        const [account] = await query(db, "SELECT email FROM users WHERE id=?", [req.user.id]);
        const [occupied] = await query(db, "SELECT id FROM users WHERE email=? AND id<>?", [
          data.email,
          req.user.id,
        ]);
        if (occupied) throw new HttpError(409, "该邮箱已绑定其他账号");
        const result = await issueChallenge({
          purpose: "bind",
          address: data.email,
          targetUserId: req.user.id,
          payload: { previousEmail: account.email },
        });
        await recordActivity(browserHash, "bind_email_send");
        res.json(result);
      });
      app.post("/api/email/bind/confirm", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中绑定邮箱");
        const challenge = await verifiedChallenge(req.body, "bind", req.user.id);
        const payload =
          typeof challenge.payload === "string" ? JSON.parse(challenge.payload) : challenge.payload;
        try {
          await transaction(db, async (conn) => {
            await query(
              conn,
              "UPDATE users SET email=?,email_verified_at=UTC_TIMESTAMP(3) WHERE id=?",
              [challenge.email, req.user.id],
            );
            await service.accountChange(conn, req.user.id, req.user.id, "email_bound", {
              before: payload.previousEmail,
              after: challenge.email,
            });
          });
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "该邮箱已绑定其他账号");
          throw error;
        }
        const [profile] = await query(
          db,
          "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
          [req.user.id],
        );
        res.json(personalProfile(profile));
      });
      app.get("/api/notifications", async (req, res) =>
        res.json(await service.notifications(req.user, req.query.before, req.query)),
      );
      app.post("/api/notifications/read-all", async (req, res) =>
        res.json(await service.readNotification(req.user)),
      );
      app.post("/api/notifications/:id/read", async (req, res) =>
        res.json(await service.readNotification(req.user, req.params.id)),
      );
      app.post("/api/notifications/:id/open", async (req, res) =>
        res.json(await service.openNotification(req.user, req.params.id)),
      );
      app.delete("/api/projects/:id/members/:userId", async (req, res) =>
        res.json(await service.removeMember(req.user, req.params.id, req.params.userId)),
      );
      app.patch("/api/projects/:id/members/:userId/role", async (req, res) =>
        res.json(
          await service.updateMemberRole(req.user, req.params.id, req.params.userId, req.body),
        ),
      );
      app.post("/api/projects/:id/leader", async (req, res) =>
        res.json(await service.transferProjectLeader(req.user, req.params.id, req.body)),
      );
      app.post("/api/projects/:id/admins", async (req, res) =>
        res.status(201).json(await service.addProjectAdmin(req.user, req.params.id, req.body)),
      );
      app.delete("/api/projects/:id/admins/:userId", async (req, res) =>
        res.json(await service.removeProjectAdmin(req.user, req.params.id, req.params.userId)),
      );
      app.patch("/api/me", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中修改个人资料");
        const data = profileSchema.parse(req.body);
        await query(db, "UPDATE users SET name=?,avatar=?,motto=?,identity_tags=? WHERE id=?", [
          data.name,
          data.avatar,
          data.motto,
          JSON.stringify(data.identity_tags),
          req.user.id,
        ]);
        await query(
          db,
          "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
          [
            randomUUID(),
            req.user.id,
            req.user.id,
            "profile_updated",
            JSON.stringify({
              name: data.name,
              motto: data.motto,
              identity_tags: data.identity_tags,
            }),
          ],
        );
        res.json(personalProfile({ ...req.user, ...data }));
      });
      app.patch("/api/me/username", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中修改用户名");
        const data = z
          .object({
            username: z.string().trim().min(3, "用户名至少需要 3 位").max(80),
            currentPassword: z.string().min(1, "请输入当前密码").max(200),
          })
          .parse(req.body);
        const [account] = await query(db, "SELECT password_hash FROM users WHERE id=?", [
          req.user.id,
        ]);
        if (!(await verifyPassword(data.currentPassword, account.password_hash)))
          throw new HttpError(400, "当前密码错误");
        if (data.username !== req.user.username) {
          const taken = await query(
            db,
            "SELECT id FROM users WHERE id<>? AND (LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?))",
            [req.user.id, data.username, data.username],
          );
          if (taken.length) throw new HttpError(409, "该用户名已被使用");
          try {
            await query(db, "UPDATE users SET username=? WHERE id=?", [data.username, req.user.id]);
          } catch (error) {
            if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "该用户名已被使用");
            throw error;
          }
          await service.accountChange(db, req.user.id, req.user.id, "username_updated", {
            username: data.username,
          });
        }
        const [profile] = await query(
          db,
          "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
          [req.user.id],
        );
        res.json(personalProfile(profile));
      });
      app.patch("/api/me/theme", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中修改主题");
        const theme = normalizeUiTheme(
          z
            .object({
              theme: z
                .string()
                .refine((value) => UI_THEMES.some((item) => item.id === value), "主题无效"),
            })
            .parse(req.body).theme,
        );
        await query(db, "UPDATE users SET ui_theme=? WHERE id=?", [theme, req.user.id]);
        const [profile] = await query(
          db,
          "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
          [req.user.id],
        );
        res.json(personalProfile(profile));
      });
      app.post("/api/logout", async (req, res) => {
        await query(db, "DELETE FROM credentials WHERE id=?", [req.user.credential_id]);
        appendCookie(res, sessionCookie("", req));
        res.json({ ok: true });
      });
      app.post("/api/session/remember", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中保存登录");
        const session = await issueCredential(db, req.user.id, "session", "账号切换");
        if (req.user.credential_id) {
          await query(db, "DELETE FROM credentials WHERE id=? AND user_id=?", [
            req.user.credential_id,
            req.user.id,
          ]);
        }
        appendCookie(res, sessionCookie(session.token, req), true);
        const [profile] = await query(
          db,
          "SELECT id,user_number,username,name,email,avatar,motto,identity_tags,is_super_admin,ui_theme FROM users WHERE id=?",
          [req.user.id],
        );
        res.json({ ...personalProfile(profile), sessionToken: session.token });
      });
      app.post("/api/password", async (req, res) => {
        if (req.user.kind !== "session") throw new HttpError(403, "请在浏览器中修改密码");
        const data = z
          .object({
            currentPassword: z.string().max(200),
            password: z.string().min(8).max(200),
          })
          .parse(req.body);
        const [user] = await query(db, "SELECT password_hash FROM users WHERE id=?", [req.user.id]);
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
        await query(
          db,
          "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
          [randomUUID(), req.user.id, req.user.id, "password_changed", JSON.stringify({})],
        );
        res.json({ ok: true });
      });
      app.get("/api/users", async (req, res) =>
        res.json(await service.users(req.user, req.query.projectId)),
      );
      app.post("/api/users", async (req, res) =>
        res.status(201).json(await service.createUser(req.user, req.body)),
      );
    },
  };
}
