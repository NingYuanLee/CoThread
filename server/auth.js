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
      new Date(Date.now() + (kind === "session" ? 7 : 30) * 86400000),
      kind === "api" ? await encryptToken(token, userId) : null,
    ],
  );
  return { id, token };
}
export async function accountCredential(db, userId, reset = false) {
  return transaction(db, async (conn) => {
    await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
    const rows = await query(conn, "SELECT *,expires_at>UTC_TIMESTAMP(3) valid FROM credentials WHERE user_id=? AND kind='api'", [userId]);
    const current = rows[0];
    if (!reset && rows.length === 1 && Number(current.valid) === 1 && !current.project_id && current.token_ciphertext) {
      return { id: current.id, token: await decryptToken(current.token_ciphertext, userId) };
    }
    await query(conn, "DELETE FROM credentials WHERE user_id=? AND kind='api'", [userId]);
    return issueCredential(conn, userId, "api", "本地 Agent");
  });
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
    `SELECT u.id,u.name,u.email,u.motto,u.identity_tags,c.id credential_id,c.kind,c.project_id scope
    FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.token_hash=? AND c.expires_at>UTC_TIMESTAMP(3)`,
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
