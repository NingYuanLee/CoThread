import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { query, transaction } from "./db.js";

/** One tool, scoped to the immutable bytes and queue attempt that opened it. */
export async function startFileIndexSubmissionBridge(
  db,
  { projectId, versionId, sha256, mime, validate },
) {
  const attemptId = randomUUID();
  const token = randomBytes(24).toString("hex");
  const specs = [
    {
      name: "save_file_index_summary",
      description: "保存当前文件的识别摘要。仅提交有依据的事实、主题和图片文字，提交后结束本轮。",
      parameters: {
        summary: {
          type: "string",
          required: true,
          description: "文件内容的可靠摘要，最多 4000 字。",
        },
        topics: { type: "array", items: { type: "string" }, description: "零到五个内容主题。" },
        ocrText: { type: "string", description: "图片中清晰可辨文字，其他文件留空。" },
      },
    },
  ];
  const bridge = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      req.method !== "POST" ||
      req.url !== "/tool" ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.writeHead(403).end("{}");
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 64000) throw new Error("工具输入过长");
      }
      const request = JSON.parse(body);
      if (request.name !== specs[0].name) throw new Error("没有这个工具");
      const payload = validate(request.args || {});
      await transaction(db, async (conn) => {
        const [file] = await query(
          conn,
          `SELECT q.version_id FROM agent_document_memory_queue q
          JOIN versions v ON v.id=q.version_id JOIN artifacts a ON a.id=v.artifact_id
          JOIN projects project ON project.id=a.project_id
          LEFT JOIN version_recycle r ON r.version_id=v.id
          WHERE q.version_id=? AND a.project_id=? AND q.processing_state='processing'
          AND project.archived_at IS NULL AND a.deleted_at IS NULL AND a.purged_at IS NULL AND r.version_id IS NULL
          AND v.sha256=? AND v.mime=? AND (q.content_sha256 IS NULL OR q.content_sha256=v.sha256)
          AND (q.content_mime IS NULL OR q.content_mime=v.mime)
          AND NOT EXISTS (SELECT 1 FROM versions newer LEFT JOIN version_recycle nr ON nr.version_id=newer.id
            WHERE newer.artifact_id=a.id AND newer.version>v.version AND nr.version_id IS NULL) FOR UPDATE`,
          [versionId, projectId, sha256, mime],
        );
        if (!file) throw new Error("文件或待处理任务已变化，无法保存本次结果");
        const [existing] = await query(
          conn,
          "SELECT payload FROM file_index_tool_submissions WHERE attempt_id=? FOR UPDATE",
          [attemptId],
        );
        if (existing) {
          const previous =
            typeof existing.payload === "string" ? JSON.parse(existing.payload) : existing.payload;
          if (!isDeepStrictEqual(previous, payload))
            throw new Error("本次识别结果已提交，不能改写");
          return;
        }
        await query(
          conn,
          `INSERT INTO file_index_tool_submissions
          (attempt_id,project_id,version_id,content_sha256,content_mime,payload) VALUES(?,?,?,?,?,?)`,
          [attemptId, projectId, versionId, sha256, mime, JSON.stringify(payload)],
        );
      });
      res.end(JSON.stringify({ saved: true }));
    } catch (error) {
      res
        .writeHead(400)
        .end(JSON.stringify({ error: String(error?.message || "保存失败").slice(0, 300) }));
    }
  });
  await new Promise((resolve, reject) => {
    bridge.once("error", reject);
    bridge.listen(0, "127.0.0.1", resolve);
  });
  return {
    env: {
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify([specs[0].name]),
      COTHREAD_MCP_TOOLS: JSON.stringify(specs),
    },
    async result() {
      const [row] = await query(
        db,
        "SELECT payload FROM file_index_tool_submissions WHERE attempt_id=?",
        [attemptId],
      );
      if (!row) throw new Error("模型未调用保存文件摘要工具");
      return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    },
    close: () =>
      new Promise((resolve, reject) =>
        bridge.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
