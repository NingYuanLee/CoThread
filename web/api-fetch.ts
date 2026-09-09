import { readJsonResponse, requestJson } from "../shared/json-response.js";

export function fetchJson(url: string, options: RequestInit = {}) {
  return requestJson(url, options, apiFetch);
}

// Keep each network request below the Makers Cloud Functions 6 MB boundary.
// Reassembled payloads still pass the same backend authorization and validators.
export async function apiFetch(url: string, options: RequestInit = {}, progress?: (percent: number) => void): Promise<Response> {
  if ((!options.method || options.method === "GET") && /^\/api\/versions\/[0-9a-f-]{36}$/i.test(url)) {
    const meta = await fetch(url + "?metadata=1", options);
    if (!meta.ok) return meta;
    const download = await fetch(url + "/download", options);
    if (!download.ok) return download;
    const bytes = new Uint8Array(await download.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return Response.json({ ...await readJsonResponse(meta, url), contentBase64: btoa(binary) });
  }
  const body = options.body;
  if (typeof body !== "string" || body.length <= 524288) return fetch(url, options);
  const id = crypto.randomUUID();
  const chunks: string[] = [];
  for (let start = 0; start < body.length;) {
    let end = Math.min(start + 524288, body.length);
    if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
    chunks.push(body.slice(start, end));
    start = end;
  }
  const total = chunks.length;
  for (let part = 0; part < total; part++) {
    const response = await fetch(`/api/request-parts/${id}/${part}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({ content: chunks[part], total }),
    });
    if (!response.ok) return response;
    progress?.(Math.round((part + 1) / total * 95));
  }
  const headers = new Headers(options.headers);
  headers.set("X-CoThread-Upload", id);
  return fetch(url, { ...options, headers, body: "{}" });
}
