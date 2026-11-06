/**
 * API 令牌与 MCP 凭据，以及 /mcp 无状态端点。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
import { accountCredential } from "../auth.ts";
import { decryptToken } from "../credential-vault.ts";
import { query } from "../db.ts";
import { HttpError } from "../service.ts";
import { handleMcp } from "../mcp.ts";
import { MCP_CAPABILITIES } from "../../shared/mcp-capabilities.js";
import type { Express } from "express";
import type { Pool } from "mysql2/promise";

/** `service` 与 `afterMcpMessage` 只透传给 `handleMcp`，类型随之派生。 */
type McpArgs = Parameters<typeof handleMcp>;

/** 账号令牌的调用方参数。 */
type CredentialRoutesOptions = {
  db: Pool;
  service: McpArgs[2];
  afterMcpMessage: McpArgs[3];
};

export function registerCredentialRoutes(
  app: Express,
  { db, service, afterMcpMessage }: CredentialRoutesOptions,
): void {
  app.get("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const rows = await query(
      db,
      "SELECT id,label,project_id,expires_at,token_ciphertext FROM credentials WHERE user_id=? AND kind='api' ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json(
      await Promise.all(
        rows.map(async ({ token_ciphertext, ...row }) => ({
          ...row,
          token: token_ciphertext ? await decryptToken(token_ciphertext, req.user.id) : null,
        })),
      ),
    );
  });
  const mcpCredentialResponse = (credential: {
    token: unknown;
    expiresAt: unknown;
    version: unknown;
  }) => ({
    token: credential.token,
    expiresAt: credential.expiresAt,
    version: credential.version,
    endpoint: "/mcp",
    capabilities: MCP_CAPABILITIES,
  });
  app.get("/api/mcp/credential", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(mcpCredentialResponse(await accountCredential(db, req.user.id)));
  });
  app.post("/api/mcp/credential/reset", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(mcpCredentialResponse(await accountCredential(db, req.user.id, true)));
  });
  app.post("/api/tokens/ensure", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    res.json(await accountCredential(db, req.user.id));
  });
  app.post("/api/tokens", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    res.setHeader("Cache-Control", "no-store");
    const credential = await accountCredential(db, req.user.id, true);
    res.status(201).json(credential);
  });
  app.delete("/api/tokens/:id", async (req, res) => {
    if (req.user.kind !== "session") throw new HttpError(403, "需要浏览器登录");
    await query(db, "DELETE FROM credentials WHERE id=? AND user_id=? AND kind='api'", [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  });
  app.post("/mcp", async (req, res) => {
    if (req.user.kind !== "api") throw new HttpError(403, "MCP 需要账号令牌");
    await handleMcp(req, res, service, afterMcpMessage);
  });
}
