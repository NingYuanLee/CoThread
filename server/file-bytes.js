import { timingSafeEqual } from "node:crypto";
import { digest } from "./auth.js";
import {
  INLINE_FILE_MAX_BYTES,
  sha256HexPattern,
} from "../shared/upload-limits.js";

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function parseSha256(value, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) fail(400, "必须提供文件 sha256");
    return undefined;
  }
  const hex = String(value).trim().toLowerCase();
  if (!sha256HexPattern.test(hex)) fail(400, "sha256 必须是 64 位十六进制");
  return hex;
}

export function hashesEqual(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

export function verifyBytes(bytes, expectedSha256, maxBytes, limitMessage) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length > maxBytes)
    fail(413, limitMessage || `单个文件上限为 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);
  const sha256 = digest(bytes);
  const expected = parseSha256(expectedSha256);
  if (expected && !hashesEqual(sha256, expected))
    fail(400, "文件内容与 sha256 不一致，可能在传输中被截断，请改用分片上传");
  return { bytes, sha256, byteSize: bytes.length };
}

export function decodeUploadedBytes(contentBase64, { sha256, maxBytes = INLINE_FILE_MAX_BYTES } = {}) {
  if (typeof contentBase64 !== "string") fail(400, "文件内容必须为有效的 base64");
  let bytes;
  try {
    bytes = Buffer.from(contentBase64, "base64");
  } catch {
    fail(400, "文件内容必须为有效的 base64");
  }
  if (bytes.toString("base64") !== contentBase64)
    fail(400, "文件内容必须为有效的 base64；若文件较大请改用分片上传，不要一次提交整包");
  return verifyBytes(bytes, sha256, maxBytes);
}
