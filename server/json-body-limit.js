const MB = 1024 * 1024;

/**
 * 大多数接口不到 1mb。文件字节只出现在少数路由：
 * 分片和 MCP 一片最多约 700KB Base64；单文件内联上限 5 MiB（Base64 约 7MB）；
 * 消息附件合计与小程序源文件最多 20 MiB 原始字节（Base64 约 27MB）。
 */
export function jsonBodyLimit(method, path) {
  if (method === "POST" && /^\/api\/threads\/[^/]+\/messages$/.test(path)) return 28 * MB;
  if (method === "PUT" && /^\/api\/projects\/[^/]+\/miniprogram\/source$/.test(path))
    return 28 * MB;
  if (method === "POST" && /^\/api\/projects\/[^/]+\/documents\/upload$/.test(path)) return 8 * MB;
  if (method === "POST" && /^\/api\/projects\/[^/]+\/cloudbase\/storage\/upload$/.test(path))
    return 8 * MB;
  if (method === "POST" && /^\/api\/threads\/[^/]+\/attachments$/.test(path)) return 8 * MB;
  if (method === "POST" && /^\/api\/file-uploads\/[^/]+\/chunks$/.test(path)) return 2 * MB;
  if (method === "POST" && path === "/mcp") return 2 * MB;
  return MB;
}
