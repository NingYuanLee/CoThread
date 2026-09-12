import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";

export function registerRequestParts(app, db) {
  app.post("/api/request-parts/:id/:part", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const part = z.coerce.number().int().min(0).max(319).parse(req.params.part);
    const data = z.object({ content: z.string().max(524288), total: z.number().int().min(1).max(320) }).parse(req.body);
    if (part >= data.total) throw new HttpError(400, "分片编号无效");
    await transaction(db, async (conn) => {
      await query(conn, "SELECT id FROM users WHERE id=? FOR UPDATE", [req.user.id]);
      await query(conn, "DELETE FROM request_parts WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR");
      const [usage] = await query(conn, "SELECT COALESCE(SUM(OCTET_LENGTH(content)),0) bytes FROM request_parts WHERE user_id=?", [req.user.id]);
      if (Number(usage.bytes) + Buffer.byteLength(data.content) > 160 * 1024 * 1024)
        throw new HttpError(413, "临时上传空间已满，请稍后重试");
      await query(conn, `INSERT INTO request_parts(user_id,upload_id,part_number,total_parts,content) VALUES(?,?,?,?,?)
        ON DUPLICATE KEY UPDATE content=VALUES(content),total_parts=VALUES(total_parts)`,
      [req.user.id, id, part, data.total, Buffer.from(data.content)]);
    });
    res.json({ ok: true });
  });
  app.use("/api", async (req, res, next) => {
    const id = req.get("X-CoThread-Upload");
    if (!id) return next();
    z.string().uuid().parse(id);
    if (!["POST", "PUT", "PATCH"].includes(req.method)) throw new HttpError(400, "无效分片请求");
    req.body = await transaction(db, async (conn) => {
      const parts = await query(conn, "SELECT part_number,total_parts,content FROM request_parts WHERE user_id=? AND upload_id=? ORDER BY part_number FOR UPDATE", [req.user.id, id]);
      if (!parts.length || parts.length !== parts[0].total_parts ||
          parts.some((part, i) => part.part_number !== i || part.total_parts !== parts.length))
        throw new HttpError(400, "上传分片不完整");
      if (parts.reduce((n, p) => n + p.content.length, 0) > 160 * 1024 * 1024)
        throw new HttpError(413, "请求过大");
      let body;
      try { body = JSON.parse(Buffer.concat(parts.map(p => p.content)).toString("utf8")); }
      catch { throw new HttpError(400, "上传内容格式错误"); }
      await query(conn, "DELETE FROM request_parts WHERE user_id=? AND upload_id=?", [req.user.id, id]);
      return body;
    });
    next();
  });
}
