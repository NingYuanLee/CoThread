/** 网页一次性 Base64 仍走这条上限（与历史 5 MiB 一致）。 */
export const INLINE_FILE_MAX_BYTES = 5 * 1024 * 1024;
/** 许多 MCP 宿主会截断约 10KB 的工具参数；超过此长度必须分片。 */
export const MCP_INLINE_BASE64_MAX = 10000;
/** 分片合并后的单文件上限。需 MySQL max_allowed_packet ≥ 32 MiB。 */
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * MCP 默认分片。许多宿主会把工具参数截在约 10KB；6144 字节的 Base64 正好 8KB。
 * 网页上传可改用更大 chunkSize。
 */
export const FILE_CHUNK_SIZE = 6144;
export const FILE_CHUNK_MIN = 4096;
export const FILE_CHUNK_MAX = 512 * 1024;
/** 网页上传用较大分片，避免 20MiB 文件打出三千多次 6KB 请求。Base64 仍低于网关 512KB 拆包线。 */
export const WEB_FILE_CHUNK_SIZE = 256 * 1024;

export function webFileChunkSize(byteSize) {
  return Number(byteSize) > FILE_CHUNK_SIZE ? WEB_FILE_CHUNK_SIZE : FILE_CHUNK_SIZE;
}
export const FILE_UPLOAD_TTL_MS = 60 * 60 * 1000;
export const FILE_UPLOAD_MAX_SESSIONS = 30;
export const FILE_UPLOAD_MAX_PENDING_BYTES = 160 * 1024 * 1024;

export const sha256HexPattern = /^[0-9a-f]{64}$/i;

export function fileChunkCount(byteSize, chunkSize) {
  return Math.ceil(Number(byteSize) / Number(chunkSize));
}

export function lastChunkSize(byteSize, chunkSize) {
  const rem = Number(byteSize) % Number(chunkSize);
  return rem === 0 ? Number(chunkSize) : rem;
}
