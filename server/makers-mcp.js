import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp.js";
import { authenticate } from "./auth.js";
import { Service, HttpError } from "./service.js";
import { makersDatabase, makersErrorDetails } from "./makers.js";
import { runMakersThread, validateMakersOrigin } from "./makers-runner.js";
import { makersWebRequest } from "./makers-request.js";

export function createMakersMcpHandler(getDatabase = makersDatabase) {
  return async ({ request }) => {
    let server;
    try {
      request = makersWebRequest(request);
      validateMakersOrigin(request);
      const db = await getDatabase();
      const user = await authenticate(db, { headers: Object.fromEntries(request.headers) });
      if (!user) throw new HttpError(401, "需要有效的账号令牌");
      if (user.kind !== "api") throw new HttpError(403, "MCP 需要账号令牌");
      if (request.headers.get("Makers-Conversation-Id") !== user.id)
        throw new HttpError(400, "请重新复制本站 MCP 安装文档，使用账号对应的 Makers-Conversation-Id");
      server = createMcpServer(new Service(db), user,
        (actor, threadId) => runMakersThread(db, actor, threadId));
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, enableJsonResponse: true,
      });
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // Consume the JSON response while the invocation is still active; MCP writes
      // and any requested Agent execution finish before its runtime is reclaimed.
      const body = await response.arrayBuffer();
      return new Response(body.byteLength ? body : null, {
        status: response.status, headers: response.headers,
      });
    } catch (error) {
      console.error("Makers MCP failed", { code: error.code || error.name });
      return Response.json({ error: error.status ? error.message : "MCP 暂时不可用，请检查云端配置",
        ...makersErrorDetails(error) }, { status: error.status || 503 });
    } finally { await server?.close(); }
  };
}
