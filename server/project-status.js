import { query } from "./db.ts";

/**
 * 项目现状只有一份 Markdown：随项目进程结算整份覆盖，不保留修订或来源快照。
 * 历史变化由项目进程条目承担，这里只存「当前是什么样」。
 */
export const PROJECT_STATUS_MAX_BYTES = 60000;

export async function readProjectStatus(db, projectId) {
  const [row] = await query(
    db,
    "SELECT project_id projectId,body,updated_at updatedAt,updated_by updatedBy FROM project_status WHERE project_id=?",
    [projectId],
  );
  return row || null;
}

/** 只保留正文：去掉标题行、列表符号、引用、加粗与分隔线等 Markdown 修饰。 */
export function plainProjectStatusBody(value) {
  const kept = [];
  for (const line of String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (/^\s{0,3}#{1,6}\s+/.test(line)) continue;
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;
    kept.push(
      line
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .trimEnd(),
    );
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeProjectStatusBody(value) {
  const body = plainProjectStatusBody(value);
  if (!body) throw new Error("项目现状正文为空");
  if (Buffer.byteLength(body, "utf8") > PROJECT_STATUS_MAX_BYTES)
    throw new Error("项目现状正文超过存储上限");
  return body;
}

/** 调用方负责事务：与进程条目提交成功一起覆盖，失败一起回滚。 */
export async function writeProjectStatus(conn, projectId, body, userId) {
  const text = normalizeProjectStatusBody(body);
  await query(
    conn,
    `INSERT INTO project_status(project_id,body,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE body=VALUES(body),updated_by=VALUES(updated_by)`,
    [projectId, text, userId || null],
  );
  return text;
}
