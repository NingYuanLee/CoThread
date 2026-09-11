import { makersDatabase, makersErrorDetails } from "../../server/makers.js";
import { makersWebRequest } from "../../server/makers-request.js";
import { processNextProjectMemory } from "../../server/project-memory.js";

export async function handleRequest({ request }) {
  try {
    request = makersWebRequest(request);
    if (request.method !== "POST") return Response.json({ error: "仅支持 POST" }, { status: 405 });
    const configured = process.env.MEMORY_MAINTENANCE_TOKEN;
    const supplied = request.headers.get("authorization");
    if (!configured || supplied !== `Bearer ${configured}`)
      return Response.json({ error: "知识库维护凭据无效" }, { status: 401 });
    const db = await makersDatabase();
    let processed = 0;
    while (processed < 25 && await processNextProjectMemory(db)) processed++;
    return Response.json({ status: "ok", processed },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Makers project memory failed", { code: error.code || error.name });
    return Response.json({ error: "项目知识库维护失败，请检查云端日志及配置",
      ...makersErrorDetails(error) }, { status: error.status || 500 });
  }
}

export const onRequest = handleRequest;
