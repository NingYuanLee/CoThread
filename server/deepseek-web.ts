import { HttpError } from "./http-error.ts";
import { platformSearchApiKey } from "./model-config.ts";

const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
const FETCH_URL = "https://api.deepseek.com/v1/tools/fetch";

/** 网页服务返回的 JSON 负载。 */
type WebPayload = Record<string, unknown>;

/** 调用网页服务用的 fetch 实现（测试可替换）。 */
type WebRequest = (
  url: string,
  init: { method: string; signal: AbortSignal; headers: Record<string, string>; body: string },
) => Promise<Response>;

function requireKey(apiKey: unknown): string {
  const key = (apiKey || platformSearchApiKey()) as string | undefined;
  if (!key) throw new HttpError(409, "还没配置网页搜索密钥");
  return key;
}

async function postJson(
  request: WebRequest,
  url: string,
  apiKey: string,
  body: WebPayload,
): Promise<WebPayload> {
  let response: Response;
  try {
    response = await request(url, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "网页服务没有连上");
  }
  let data: WebPayload | null = null;
  try {
    data = (await response.json()) as WebPayload;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const errorBody = data?.error as { message?: unknown } | undefined;
    const message =
      errorBody?.message ||
      (response.status === 429 ? "网页搜索太频繁，请稍后再试" : "网页服务没有成功");
    throw new HttpError(response.status || 502, String(message));
  }
  if (!data || typeof data !== "object") throw new HttpError(502, "网页服务没有返回结果");
  return data;
}

function presentText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value);
  return text.trim() ? text : undefined;
}

/** `deepseekSearch` 的可选参数。 */
export type DeepseekSearchOptions = {
  count?: unknown;
  oriQuestion?: unknown;
  localization?: unknown;
  needContent?: unknown;
  request?: WebRequest;
  apiKey?: unknown;
};

export async function deepseekSearch(
  query: unknown,
  {
    count,
    oriQuestion,
    localization,
    needContent,
    request = fetch as unknown as WebRequest,
    apiKey,
  }: DeepseekSearchOptions = {},
): Promise<unknown[]> {
  const key = requireKey(apiKey);
  const text = String(query ?? "");
  if (!text.trim()) throw new HttpError(400, "搜索词不能为空");
  const body: WebPayload = { query: text };
  if (count !== undefined && count !== null && count !== "") body.count = count;
  const original = presentText(oriQuestion);
  if (original) body.ori_question = original;
  const locale = presentText(localization);
  if (locale) body.localization = locale;
  if (typeof needContent === "boolean") body.need_content = needContent;
  const data = await postJson(request, SEARCH_URL, key, body);
  return Array.isArray(data.results) ? (data.results as unknown[]) : [];
}

export function publicPageUrl(value: unknown): string {
  const text = String(value || "").trim();
  if (!text || text.length > 8192) throw new HttpError(400, "网页地址不正确");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, "网页地址不正确");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new HttpError(400, "只接受 http 或 https 网页");
  if (url.username || url.password) throw new HttpError(400, "网页地址不能带账号");
  if (!url.host) throw new HttpError(400, "网页地址不正确");
  return url.toString();
}

export async function deepseekFetch(
  pageUrl: unknown,
  {
    request = fetch as unknown as WebRequest,
    apiKey,
  }: { request?: WebRequest; apiKey?: unknown } = {},
): Promise<{ title: string; url: string; content: string }> {
  const key = requireKey(apiKey);
  const url = publicPageUrl(pageUrl);
  const data = await postJson(request, FETCH_URL, key, { url });
  return {
    title: data.title == null ? "" : String(data.title),
    url,
    content: data.content == null ? "" : String(data.content),
  };
}
