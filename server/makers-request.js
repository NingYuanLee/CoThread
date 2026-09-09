// Makers Agents supplies a parsed request object, not a Fetch Request. MCP's
// web transport and our auth/origin checks use the Fetch interface instead.
export function makersWebRequest(request) {
  if (request instanceof Request) return request;
  const headers = new Headers();
  for (const [name, values] of Object.entries(request.headers || {})) {
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value !== undefined) headers.append(name, String(value));
    }
  }
  const method = (request.method || "GET").toUpperCase();
  let body;
  if (method !== "GET" && method !== "HEAD" && request.body !== undefined) {
    const input = request.body;
    const binary = input instanceof ArrayBuffer || ArrayBuffer.isView(input);
    body = binary || typeof input === "string" && !headers.get("content-type")?.includes("application/json")
      ? input : JSON.stringify(input);
  }
  return new Request(request.url, { method, headers, body, signal: request.signal });
}
