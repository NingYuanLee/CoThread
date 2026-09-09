export async function readJsonResponse(response, path = "接口") {
  const endpoint = path.split("?")[0];
  const type = response.headers.get("content-type") || "";
  let value;
  try {
    if (!/\bjson\b/i.test(type)) throw new Error("Non-JSON response");
    value = await response.json();
  } catch {
    throw Object.assign(new Error(`服务暂时未返回有效数据（${endpoint}，HTTP ${response.status}），请稍后重试。`), {
      status: response.status, transient: response.status >= 500 || response.ok,
      requestId: response.headers.get("x-cothread-request-id") || response.headers.get("x-request-id") || response.headers.get("x-scf-request-id"),
    });
  }
  if (!response.ok) throw Object.assign(new Error(value?.error || `请求失败（${endpoint}，HTTP ${response.status}）`), {
    status: response.status, transient: [502, 503, 504].includes(response.status),
  });
  return value;
}

// Retry only reads: a failed POST response may already have committed its work.
export async function requestJson(path, options = {}, fetcher = fetch) {
  const attempts = (!options.method || options.method === "GET") ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const signal = AbortSignal.any([AbortSignal.timeout(attempts === 2 ? 20000 : 120000), ...(options.signal ? [options.signal] : [])]);
    try { return await readJsonResponse(await fetcher(path, { ...options, signal }), path); }
    catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt + 1 < attempts && (error.transient || error.name === "TypeError" || error.name === "TimeoutError")) continue;
      if (error.name === "TimeoutError") throw new Error(`请求超时（${path.split("?")[0]}），请重试。`);
      throw error;
    }
  }
}
