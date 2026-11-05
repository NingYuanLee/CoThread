import { timingSafeEqual } from "node:crypto";
import { digest } from "../auth.ts";
import { INLINE_FILE_MAX_BYTES, sha256HexPattern } from "../../shared/upload-limits.js";

/** 带 HTTP 状态码的错误，由响应层读出。 */
type StatusError = Error & { status: number };

function fail(status: number, message: string): never {
  const error = new Error(message) as StatusError;
  error.status = status;
  throw error;
}

/** 校验 sha256 参数；`required` 为真时缺失即报错。 */
export function parseSha256(
  value: unknown,
  { required = false }: { required?: boolean } = {},
): string | undefined {
  if (value == null || value === "") {
    if (required) fail(400, "必须提供文件 sha256");
    return undefined;
  }
  const hex = String(value).trim().toLowerCase();
  if (!(sha256HexPattern as RegExp).test(hex)) fail(400, "sha256 必须是 64 位十六进制");
  return hex;
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

/** 校验一份文件字节的大小与哈希，返回规范化后的结果。 */
export function verifyBytes(
  input: unknown,
  expectedSha256: unknown,
  maxBytes: number,
  limitMessage?: string,
): { bytes: Buffer; sha256: string; byteSize: number } {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input as string);
  if (bytes.length > maxBytes)
    fail(413, limitMessage || `单个文件上限为 ${Math.floor(maxBytes / 1024 / 1024)} MiB`);
  const sha256 = digest(bytes);
  const expected = parseSha256(expectedSha256);
  if (expected && !hashesEqual(sha256, expected))
    fail(400, "文件内容与 sha256 不一致，可能在传输中被截断，请改用分片上传");
  return { bytes, sha256, byteSize: bytes.length };
}

/** 解码内联上传的 base64，并按上限与哈希校验。 */
export function decodeUploadedBytes(
  contentBase64: unknown,
  {
    sha256,
    maxBytes = INLINE_FILE_MAX_BYTES as number,
  }: { sha256?: unknown; maxBytes?: number } = {},
): { bytes: Buffer; sha256: string; byteSize: number } {
  if (typeof contentBase64 !== "string") fail(400, "文件内容必须为有效的 base64");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(contentBase64 as string, "base64");
  } catch {
    fail(400, "文件内容必须为有效的 base64");
  }
  if (bytes!.toString("base64") !== contentBase64)
    fail(400, "文件内容必须为有效的 base64；若文件较大请改用分片上传，不要一次提交整包");
  return verifyBytes(bytes!, sha256, maxBytes);
}
