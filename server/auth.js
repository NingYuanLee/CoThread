import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { query, transaction } from "./db.js";
import { encryptToken, decryptToken } from "./credential-vault.js";
import { readPreviewTicket, splitPreviewAssetPath } from "../shared/preview-ticket.mjs";
const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [salt, key] = stored.split(":");
  const actual = await scrypt(password, salt, 64);
  return (
    actual.length === Buffer.from(key, "hex").length &&
    timingSafeEqual(actual, Buffer.from(key, "hex"))
  );
}
export async function issueCredential(
  db,
  userId,
  kind,
  label,
  projectId = null,
) {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + (kind === "session" ? 7 : 30) * 86400000);
  await query(
    db,
    "INSERT INTO credentials(id,user_id,token_hash,kind,label,project_id,expires_at,token_ciphertext) VALUES(?,?,?,?,?,?,?,?)",
    [
      id,
      userId,
      digest(token),
      kind,
      label,
      projectId,
      expiresAt,
      kind === "api" ? await encryptToken(token, userId) : null,
    ],
  );
  return { id, token, expiresAt: expiresAt.toISOString(), version: 1 };
}
// 连接池使用 dateStrings + timezone "Z"：DATETIME 以 "YYYY-MM-DD HH:MM:SS[.fff]" 的 UTC 字符串返回。
function utcTimestampToIso(value) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "").trim();
  if (!text) return null;
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`).toISOString();
}
export async function accountCredential(db, userId, reset = false) {
  return transaction(db, async (conn) => {
    await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
    const rows = await query(conn, "SELECT *,expires_at>UTC_TIMESTAMP(3) valid FROM credentials WHERE user_id=? AND kind='api'", [userId]);
    const current = rows[0];
    if (!reset && rows.length === 1 && Number(current.valid) === 1 && !current.project_id && current.token_ciphertext) {
      return { id: current.id, token: await decryptToken(current.token_ciphertext, userId),
        expiresAt: utcTimestampToIso(current.expires_at), version: Number(current.version || 1) };
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    const ciphertext = await encryptToken(token, userId);
    if (current && !current.project_id) {
      await query(conn, `UPDATE credentials SET token_hash=?,label='本地 Agent',expires_at=?,token_ciphertext=?,version=version+1
        WHERE id=?`, [digest(token), expiresAt, ciphertext, current.id]);
      await query(conn, "DELETE FROM credentials WHERE user_id=? AND kind='api' AND id<>?", [userId, current.id]);
      return { id: current.id, token, expiresAt: expiresAt.toISOString(), version: Number(current.version || 1) + 1 };
    }
    await query(conn, "DELETE FROM credentials WHERE user_id=? AND kind='api'", [userId]);
    return issueCredential(conn, userId, "api", "本地 Agent");
  });
}

export async function accountCredentialVersion(db, userId) {
  const [row] = await query(db, `SELECT version,expires_at FROM credentials
    WHERE user_id=? AND kind='api' AND project_id IS NULL ORDER BY created_at DESC LIMIT 1`, [userId]);
  return { version: Number(row?.version || 0), expiresAt: row ? utcTimestampToIso(row.expires_at) : null };
}
export async function authenticate(db, req) {
  const bearer = req.headers.authorization?.match(
    /^Bearer ([A-Za-z0-9_-]+)$/,
  )?.[1];
  const cookie = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("cothread_session="))
    ?.slice(17);
  const token = bearer || cookie;
  if (!token) return null;
  const [row] = await query(
    db,
    `SELECT u.id,u.user_number,u.username,u.name,u.email,u.motto,u.identity_tags,u.is_super_admin,u.ui_theme,c.id credential_id,c.kind,c.project_id scope
    FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.token_hash=? AND c.expires_at>UTC_TIMESTAMP(3) AND u.disabled_at IS NULL`,
    [digest(token)],
  );
  if (
    !row ||
    (bearer && row.kind !== "api") ||
    (!bearer && row.kind !== "session")
  )
    return null;
  return row;
}

export async function authenticatePreviewTicket(db, req) {
  if (String(req.method || "GET").toUpperCase() !== "GET") return null;
  const path = String(req.originalUrl || req.path || "").split("?")[0];
  const match = path.match(/\/versions\/([^/]+)\/preview\/(.*)$/);
  if (!match) return null;
  const versionId = match[1];
  const { ticket } = splitPreviewAssetPath(match[2]);
  const parsed = readPreviewTicket(ticket);
  if (!parsed || parsed.versionId !== versionId) return null;
  const [row] = await query(
    db,
    `SELECT u.id,u.user_number,u.username,u.name,u.email,u.motto,u.identity_tags,u.is_super_admin,u.ui_theme
    FROM users u WHERE u.id=? AND u.disabled_at IS NULL`,
    [parsed.userId],
  );
  if (!row) return null;
  return { ...row, kind: "session", credential_id: null, scope: null };
}
