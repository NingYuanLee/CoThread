import { z } from "zod/v3";
export const id = z.string().uuid();
export const title = z.string().trim().min(1).max(160);
export const body = z.string().trim().min(1).max(20000);
export const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
export const parseMessageRow = (m) => ({
  ...m,
  refs: json(m.refs) || [],
  folder_refs: json(m.folder_refs) || [],
});
export const mentions = (text, value) => {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escaped}(?=$|[^\\p{L}\\p{N}_@])`, "u").test(text);
};
export function preferredLocalExecutorJoin() {
  return `LEFT JOIN (
    SELECT c.id, c.user_id, c.name, c.platform, c.version, c.last_seen_at,
      ROW_NUMBER() OVER (
        PARTITION BY c.user_id
        ORDER BY IF(bp.local_executor_id IS NULL, 1, 0), c.last_seen_at DESC, c.created_at DESC, c.id
      ) rn
    FROM local_executors c
    LEFT JOIN local_executor_projects bp ON bp.local_executor_id = c.id AND bp.project_id = ?
    WHERE c.revoked_at IS NULL
  ) c ON c.user_id = u.id AND c.rn = 1`;
}
import { HttpError } from "./http-error.js";
export const fail = (status, message) => {
  throw new HttpError(status, message);
};
