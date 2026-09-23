import { makersDatabase, makersErrorDetails } from "../../server/makers.js";
import { makersWebRequest } from "../../server/makers-request.js";
import { assertMemoryMaintenanceAuth, runMemoryMaintenance } from "../../server/memory-maintenance.js";
import { HttpError } from "../../server/service.js";

export async function handleRequest({ request }) {
  try {
    request = makersWebRequest(request);
    if (request.method !== "POST") return Response.json({ error: "仅支持 POST" }, { status: 405 });
    try {
      assertMemoryMaintenanceAuth(request.headers.get("authorization"));
    } catch (error) {
      if (error instanceof HttpError)
        return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const db = await makersDatabase();
    const result = await runMemoryMaintenance(db, { maxBatches: 25 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Makers project memory failed", { code: error.code || error.name });
    return Response.json({ error: "项目知识库维护失败，请检查云端日志及配置",
      ...makersErrorDetails(error) }, { status: error.status || 500 });
  }
}

export const onRequest = handleRequest;
