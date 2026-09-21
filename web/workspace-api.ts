import { fetchJson } from "./api-fetch";
import { wakeMakers } from "./makers";

export async function api(path: string, data?: unknown, method?: string, signal?: AbortSignal, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  const result = await fetchJson(`/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers,
    signal,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const work = path.match(/^\/threads\/([^/]+)\/(?:messages|summary|context\/compact|replies\/[^/]+\/retry)$/);
  if (work && (method || (data === undefined ? "GET" : "POST")) === "POST") wakeMakers(work[1], undefined, true);
  return result;
}

export type WorkspaceApi = typeof api;
