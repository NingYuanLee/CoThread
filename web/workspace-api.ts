import { fetchJson } from "./api-fetch";

export async function api(path: string, data?: unknown, method?: string, signal?: AbortSignal, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  const result = await fetchJson(`/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers,
    signal,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return result;
}

export type WorkspaceApi = typeof api;
