import { decryptToken, encryptToken } from "./credential-vault.js";
import { query } from "./db.js";
import { HttpError } from "./service.js";

export const USER_SKILLS = [
  {
    key: "miaowen",
    name: "腾讯广告妙问助手",
    hint: "在妙问官网登录后，从左侧「Skill 社区」复制 API KEY。只保存在当前登录账号，问老翁调用妙问时使用，不会写入本机公共文件。",
  },
];

const SKILL_KEYS = new Set(USER_SKILLS.map((skill) => skill.key));

export function assertSkillKey(skillKey) {
  if (!SKILL_KEYS.has(skillKey)) throw new HttpError(404, "没有这个技能");
  return skillKey;
}

export function assertMiaowenToken(token) {
  const value = String(token || "").trim();
  if (!/^sk-mw-[A-Za-z0-9_-]{8,180}$/.test(value))
    throw new HttpError(400, "API KEY 应以 sk-mw- 开头");
  return value;
}

function vaultId(userId, skillKey) {
  return userId + ":" + skillKey;
}

export async function listUserSkills(db, userId) {
  const rows = await query(
    db,
    "SELECT skill_key, updated_at FROM user_skill_credentials WHERE user_id=?",
    [userId],
  );
  const saved = new Map(rows.map((row) => [row.skill_key, row.updated_at]));
  return USER_SKILLS.map((skill) => ({
    key: skill.key,
    name: skill.name,
    hint: skill.hint,
    configured: saved.has(skill.key),
    updatedAt: saved.get(skill.key) || null,
  }));
}

export async function saveUserSkillSecret(db, userId, skillKey, token) {
  assertSkillKey(skillKey);
  const secret = skillKey === "miaowen" ? assertMiaowenToken(token) : String(token || "").trim();
  if (!secret) throw new HttpError(400, "请输入 API KEY");
  const cipher = await encryptToken(secret, vaultId(userId, skillKey));
  await query(
    db,
    "INSERT INTO user_skill_credentials (user_id, skill_key, secret_cipher) VALUES (?,?,?) ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher), updated_at=CURRENT_TIMESTAMP(3)",
    [userId, skillKey, cipher],
  );
}

export async function clearUserSkillSecret(db, userId, skillKey) {
  assertSkillKey(skillKey);
  await query(db, "DELETE FROM user_skill_credentials WHERE user_id=? AND skill_key=?", [
    userId,
    skillKey,
  ]);
}

export async function readUserSkillSecret(db, userId, skillKey) {
  assertSkillKey(skillKey);
  const [row] = await query(
    db,
    "SELECT secret_cipher FROM user_skill_credentials WHERE user_id=? AND skill_key=?",
    [userId, skillKey],
  );
  if (!row?.secret_cipher) return "";
  return decryptToken(String(row.secret_cipher), vaultId(userId, skillKey));
}
