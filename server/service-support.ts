import { z } from "zod/v3";
import { HttpError } from "./http-error.ts";

export const id = z.string().uuid();
export const title = z.string().trim().min(1).max(160);
export const body = z.string().trim().min(1).max(20000);

/** JSON 列可能是字符串也可能是已解析的结构；统一成结构。 */
export const json = (value: unknown): unknown =>
  typeof value === "string" ? JSON.parse(value) : value;

/** 把消息行里的 JSON 列解析成数组/对象再交给调用方。 */
export const parseMessageRow = (m: Record<string, unknown>): Record<string, unknown> => ({
  ...m,
  refs: json(m.refs) || [],
  folder_refs: json(m.folder_refs) || [],
  turn_usage: m.turn_usage == null ? null : json(m.turn_usage),
});

/** 正文里是否 @ 了某个人（按字符边界匹配，避免 @ab 命中 @abc）。 */
export const mentions = (text: string, value: string | null | undefined): boolean => {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escaped}(?=$|[^\\p{L}\\p{N}_@])`, "u").test(text);
};

export function preferredLocalExecutorJoin(): string {
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

/** 抛一个带状态码的错误；返回类型是 `never`，调用处不必再写 return。 */
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
