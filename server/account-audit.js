import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { adminAccess } from "./admin-rbac.js";

const filters = z.object({
  userNumber: z.union([z.string(), z.number()]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

function readUserNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{1,10}$/.test(text)) throw new HttpError(400, "用户 ID 必须是数字");
  return Number(text);
}

function parseDetails(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function emptyPage(data, canViewAll) {
  return { items: [], total: 0, page: data.page, pageSize: data.pageSize, canViewAll };
}

async function resolveScope(db, user, pageKey, input) {
  const access = await adminAccess(db, user);
  if (!access.permissions.includes(pageKey)) throw new HttpError(403, "没有此管理操作的权限");
  const data = filters.parse(input || {});
  const userNumber = readUserNumber(data.userNumber);
  const canViewAll = access.permissions.includes(`${pageKey}.view-all`);
  if (userNumber != null) {
    const [target] = await query(
      db,
      "SELECT id,user_number,username,email FROM users WHERE user_number=?",
      [userNumber],
    );
    if (!target || (!canViewAll && target.id !== user.id)) return { data, canViewAll, target: false };
    return { data, canViewAll, target };
  }
  if (!canViewAll) {
    const [self] = await query(db, "SELECT id,user_number,username,email FROM users WHERE id=?", [
      user.id,
    ]);
    if (!self) throw new HttpError(403, "账号已停用或不存在");
    return { data, canViewAll, target: self };
  }
  return { data, canViewAll, target: null };
}

function loginIdentity(target) {
  const ids = [target.username, target.email]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const parts = ["l.user_id=?"];
  const params = [target.id];
  if (ids.length) {
    parts.push(`(l.user_id IS NULL AND LOWER(l.email) IN (${ids.map(() => "?").join(",")}))`);
    params.push(...ids);
  }
  return { sql: `(${parts.join(" OR ")})`, params };
}

export async function listAccountChanges(db, user, input) {
  const scope = await resolveScope(db, user, "account-changes", input);
  if (scope.target === false) return emptyPage(scope.data, scope.canViewAll);
  const where = [];
  const params = [];
  if (scope.target) {
    where.push("l.target_user_id=?");
    params.push(scope.target.id);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const from =
    "account_change_logs l JOIN users t ON t.id=l.target_user_id JOIN users a ON a.id=l.actor_user_id";
  const [count] = await query(db, `SELECT COUNT(*) total FROM ${from}${clause}`, params);
  const rows = await query(
    db,
    `SELECT l.id,l.action,l.details,l.created_at,t.user_number,t.name user_name,COALESCE(t.username,t.email) username,a.name actor
     FROM ${from}${clause} ORDER BY l.created_at DESC,l.id DESC
     LIMIT ${scope.data.pageSize} OFFSET ${(scope.data.page - 1) * scope.data.pageSize}`,
    params,
  );
  return {
    items: rows.map((row) => ({
      ...row,
      user_number: Number(row.user_number),
      details: parseDetails(row.details),
    })),
    total: Number(count.total),
    page: scope.data.page,
    pageSize: scope.data.pageSize,
    canViewAll: scope.canViewAll,
  };
}

export async function listAccountLogins(db, user, input) {
  const scope = await resolveScope(db, user, "account-logins", input);
  if (scope.target === false) return emptyPage(scope.data, scope.canViewAll);
  const where = [];
  const params = [];
  if (scope.target) {
    const identity = loginIdentity(scope.target);
    where.push(identity.sql);
    params.push(...identity.params);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const from = "login_logs l LEFT JOIN users u ON u.id=l.user_id";
  const [count] = await query(db, `SELECT COUNT(*) total FROM ${from}${clause}`, params);
  const rows = await query(
    db,
    `SELECT l.id,l.email identifier,l.ip,l.country,l.province,l.city,l.district,l.success,l.failure_reason,l.created_at,
            u.user_number,u.name user_name,COALESCE(u.username,u.email) username
     FROM ${from}${clause} ORDER BY l.created_at DESC,l.id DESC
     LIMIT ${scope.data.pageSize} OFFSET ${(scope.data.page - 1) * scope.data.pageSize}`,
    params,
  );
  return {
    items: rows.map((row) => ({
      ...row,
      user_number:
        row.user_number == null
          ? scope.target
            ? Number(scope.target.user_number)
            : null
          : Number(row.user_number),
      success: Number(row.success) === 1,
    })),
    total: Number(count.total),
    page: scope.data.page,
    pageSize: scope.data.pageSize,
    canViewAll: scope.canViewAll,
  };
}
