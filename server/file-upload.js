import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { resolveStoredMime } from "./preview-mime.js";
import { decodeUploadedBytes, hashesEqual, parseSha256, verifyBytes } from "./file-bytes.js";
import { HttpError } from "./service.js";
import {
  FILE_CHUNK_MAX,
  FILE_CHUNK_MIN,
  FILE_CHUNK_SIZE,
  FILE_MAX_BYTES,
  FILE_UPLOAD_MAX_PENDING_BYTES,
  FILE_UPLOAD_MAX_SESSIONS,
  FILE_UPLOAD_TTL_MS,
  fileChunkCount,
  lastChunkSize,
} from "../shared/upload-limits.js";

const fail = (status, message) => {
  throw new HttpError(status, message);
};
const id = z.string().uuid();
const title = z.string().trim().min(1).max(160);
const filenameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((x) => !/[\\/\x00-\x1f]/.test(x), "文件名不可包含路径");

async function purgeExpired(db) {
  await query(db, "DELETE FROM file_upload_sessions WHERE expires_at < UTC_TIMESTAMP(3)");
}

function expectedChunkLength(session, index) {
  if (index < session.chunk_count - 1) return session.chunk_size;
  return lastChunkSize(session.byte_size, session.chunk_size);
}

export async function startFileUpload(service, user, input) {
  if (!["session", "api"].includes(user.kind)) fail(403, "分片上传需要人工或已授权的 MCP 账号");
  const data = z
    .object({
      kind: z.enum(["cache_draft", "official_file"]),
      threadId: id.optional(),
      projectId: id.optional(),
      folderId: id.optional(),
      title,
      filename: filenameSchema,
      mime: z.string().max(200).optional(),
      note: z.string().max(4000).default(""),
      byteSize: z.number().int().min(1).max(FILE_MAX_BYTES),
      sha256: z.string(),
      chunkSize: z.number().int().min(FILE_CHUNK_MIN).max(FILE_CHUNK_MAX).default(FILE_CHUNK_SIZE),
    })
    .parse(input);
  const sha256 = parseSha256(data.sha256, { required: true });
  data.mime = resolveStoredMime(data.filename, data.mime);
  if (data.kind === "cache_draft" && !data.threadId) fail(400, "对话缓存上传需要 threadId");
  if (data.kind === "official_file" && !data.projectId) fail(400, "正式文件上传需要 projectId");
  const chunkCount = fileChunkCount(data.byteSize, data.chunkSize);
  return transaction(service.db, async (db) => {
    await purgeExpired(db);
    let projectId = data.projectId;
    if (data.kind === "cache_draft") {
      const thread = await service.thread(user, data.threadId, true, db);
      projectId = thread.project_id;
    } else {
      await service.member(user, projectId, true, db);
      await service.assertOfficialOrganizing(db, projectId);
    }
    const [usage] = await query(
      db,
      `SELECT COUNT(*) count, COALESCE(SUM(byte_size),0) bytes
       FROM file_upload_sessions WHERE user_id=? AND version_id IS NULL`,
      [user.id],
    );
    if (Number(usage.count) >= FILE_UPLOAD_MAX_SESSIONS)
      fail(429, "同时进行的上传过多，请等待完成后再试");
    if (Number(usage.bytes) + data.byteSize > FILE_UPLOAD_MAX_PENDING_BYTES)
      fail(413, "未完成上传合计超过 160 MiB");
    const uploadId = randomUUID();
    await query(
      db,
      `INSERT INTO file_upload_sessions(
        id,user_id,kind,project_id,thread_id,folder_id,title,filename,mime,note,
        byte_size,sha256,chunk_size,chunk_count,expires_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND))`,
      [
        uploadId, user.id, data.kind, projectId, data.threadId || null, data.folderId || null,
        data.title, data.filename, data.mime, data.note, data.byteSize, sha256,
        data.chunkSize, chunkCount, FILE_UPLOAD_TTL_MS / 1000,
      ],
    );
    return {
      uploadId,
      kind: data.kind,
      byteSize: data.byteSize,
      sha256,
      chunkSize: data.chunkSize,
      chunkCount,
      expiresInSeconds: FILE_UPLOAD_TTL_MS / 1000,
    };
  });
}

export async function putFileUploadChunk(service, user, uploadId, input) {
  id.parse(uploadId);
  const data = z
    .object({
      index: z.number().int().min(0).max(8191),
      contentBase64: z.string().min(1).max(700_000),
      sha256: z.string(),
    })
    .parse(input);
  const chunkSha = parseSha256(data.sha256, { required: true });
  const decoded = decodeUploadedBytes(data.contentBase64, {
    sha256: chunkSha,
    maxBytes: FILE_CHUNK_MAX,
  });
  return transaction(service.db, async (db) => {
    await purgeExpired(db);
    const [session] = await query(
      db,
      "SELECT * FROM file_upload_sessions WHERE id=? AND user_id=? FOR UPDATE",
      [uploadId, user.id],
    );
    if (!session) fail(404, "上传会话不存在或已过期");
    if (session.version_id) fail(409, "该上传已完成");
    if (data.index >= session.chunk_count) fail(400, "分片编号无效");
    const expected = expectedChunkLength(session, data.index);
    if (decoded.byteSize !== expected)
      fail(400, `分片 ${data.index} 长度应为 ${expected} 字节`);
    const [existing] = await query(
      db,
      "SELECT sha256 FROM file_upload_chunks WHERE session_id=? AND chunk_index=? FOR UPDATE",
      [uploadId, data.index],
    );
    if (existing) {
      if (!hashesEqual(existing.sha256, decoded.sha256))
        fail(409, `分片 ${data.index} 与已上传内容不一致`);
    } else {
      await query(
        db,
        "INSERT INTO file_upload_chunks(session_id,chunk_index,sha256,content) VALUES(?,?,?,?)",
        [uploadId, data.index, decoded.sha256, decoded.bytes],
      );
    }
    const [count] = await query(
      db,
      "SELECT COUNT(*) received FROM file_upload_chunks WHERE session_id=?",
      [uploadId],
    );
    return {
      uploadId,
      index: data.index,
      receivedCount: Number(count.received),
      chunkCount: session.chunk_count,
      complete: Number(count.received) === session.chunk_count,
    };
  });
}

export async function completeFileUpload(service, user, uploadId, input = {}) {
  id.parse(uploadId);
  const data = z.object({ sha256: z.string().optional() }).parse(input || {});
  const confirmSha = parseSha256(data.sha256);
  return transaction(service.db, async (db) => {
    await purgeExpired(db);
    const [session] = await query(
      db,
      "SELECT * FROM file_upload_sessions WHERE id=? AND user_id=? FOR UPDATE",
      [uploadId, user.id],
    );
    if (!session) fail(404, "上传会话不存在或已过期");
    if (confirmSha && !hashesEqual(confirmSha, session.sha256))
      fail(400, "完成上传时的 sha256 与开始上传时不一致");
    if (session.version_id) {
      const [version] = await query(
        db,
        "SELECT id,artifact_id artifactId,version,sha256,filename,byte_size byteSize FROM versions WHERE id=?",
        [session.version_id],
      );
      return { ...version, title: session.title, mime: session.mime, reused: true };
    }
    const chunks = await query(
      db,
      "SELECT chunk_index,sha256,content FROM file_upload_chunks WHERE session_id=? ORDER BY chunk_index FOR UPDATE",
      [uploadId],
    );
    if (chunks.length !== session.chunk_count || chunks.some((chunk, i) => chunk.chunk_index !== i))
      fail(400, "上传分片不完整");
    const bytes = Buffer.concat(chunks.map((chunk) => chunk.content));
    const verified = verifyBytes(bytes, session.sha256, FILE_MAX_BYTES);
    if (verified.byteSize !== session.byte_size)
      fail(400, "合并后的文件大小与声明不一致");
    const payload = {
      title: session.title,
      filename: session.filename,
      mime: session.mime || undefined,
      note: session.note,
      sha256: verified.sha256,
    };
    const result = session.kind === "cache_draft"
      ? await service.uploadCacheDraft(user, session.thread_id, payload, { db, bytes: verified.bytes })
      : await service.uploadOfficialDocument(user, session.project_id, { ...payload, folderId: session.folder_id || undefined }, { db, bytes: verified.bytes });
    await query(db, "DELETE FROM file_upload_chunks WHERE session_id=?", [uploadId]);
    await query(db, "UPDATE file_upload_sessions SET version_id=? WHERE id=?", [result.id, uploadId]);
    return result;
  });
}