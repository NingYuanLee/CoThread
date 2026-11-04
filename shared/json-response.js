export async function readJsonResponse(response, path = "接口") {
  const endpoint = path.split("?")[0];
  const type = response.headers.get("content-type") || "";
  let value;
  try {
    if (!/\bjson\b/i.test(type)) throw new Error("Non-JSON response");
    value = await response.json();
  } catch {
    throw Object.assign(
      new Error(`服务暂时未返回有效数据（${endpoint}，HTTP ${response.status}），请稍后重试。`),
      {
        status: response.status,
        transient: response.status >= 500 || response.ok,
        requestId:
          response.headers.get("x-cothread-request-id") ||
          response.headers.get("x-request-id") ||
          response.headers.get("x-scf-request-id"),
      },
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(value?.error || `请求失败（${endpoint}，HTTP ${response.status}）`),
      {
        status: response.status,
        transient: [502, 503, 504].includes(response.status),
      },
    );
  return value;
}

// 发布/重启窗口通常只有一两秒：GET 遇到网关类失败先退避再重试，让界面自行恢复。
// 写请求永不自动重放——失败响应可能已经提交过工作。
const READ_RETRY_DELAYS_MS = [500, 1500];

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Aborted"));
    if (signal?.aborted) return abort();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        abort();
      },
      { once: true },
    );
  });
}

export async function requestJson(path, options = {}, fetcher = fetch) {
  const read = !options.method || options.method === "GET";
  const attempts = read ? READ_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(READ_RETRY_DELAYS_MS[attempt - 1], options.signal);
    const signal = AbortSignal.any([
      AbortSignal.timeout(read ? 40000 : 120000),
      ...(options.signal ? [options.signal] : []),
    ]);
    try {
      return await readJsonResponse(await fetcher(path, { ...options, signal }), path);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (
        attempt + 1 < attempts &&
        (error.transient || error.name === "TypeError" || error.name === "TimeoutError")
      )
        continue;
      if (error.name === "TimeoutError")
        throw new Error(`请求超时（${path.split("?")[0]}），请重试。`);
      throw error;
    }
  }
}
