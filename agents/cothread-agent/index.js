import { authenticate } from "../../server/auth.js";
import { HttpError } from "../../server/service.js";
import { makersDatabase } from "../../server/makers.js";
import { runMakersThread, validateMakersOrigin } from "../../server/makers-runner.js";

export async function onRequest({ request }) {
  try {
    if (request.method !== "POST") return Response.json({ error: "仅支持 POST" }, { status: 405 });
    validateMakersOrigin(request);
    const threadId = request.headers.get("Makers-Conversation-Id");
    if (!/^[0-9a-f-]{36}$/i.test(threadId || "")) throw new HttpError(400, "迭代 ID 无效");
    const db = await makersDatabase();
    const user = await authenticate(db, { headers: Object.fromEntries(request.headers) });
    if (!user) throw new HttpError(401, "请先登录，或使用有效的账号令牌");
    const body = await request.json();
    if (body.command && user.kind !== "session") throw new HttpError(403, "执行命令需要人工登录");
    const result = await runMakersThread(db, user, threadId, body.command ? { command: body.command } : undefined);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("Makers Agent failed", { code: error.code || error.name });
    return Response.json({ error: status === 500 ? "Agent 运行失败，请检查云端日志及配置" : error.message }, { status });
  }
}
