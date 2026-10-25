import { HttpError } from "./http-error.js";
import { platformSearchApiKey } from "./model-config.js";

const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
const FETCH_URL = "https://api.deepseek.com/v1/tools/fetch";

function requireKey(apiKey) {
  const key = apiKey || platformSearchApiKey();
  if (!key) throw new HttpError(409, "还没配置网页搜索密钥");
  return key;
}

async function postJson(request, url, apiKey, body) {
  let response;
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
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data?.error?.message ||
      (response.status === 429 ? "网页搜索太频繁，请稍后再试" : "网页服务没有成功");
    throw new HttpError(response.status || 502, String(message));
  }
  if (!data || typeof data !== "object") throw new HttpError(502, "网页服务没有返回结果");
  return data;
}

function presentText(value) {
  if (value == null) return undefined;
  const text = String(value);
  return text.trim() ? text : undefined;
}

export async function deepseekSearch(
  query,
  { count, oriQuestion, localization, needContent, request = fetch, apiKey } = {},
) {
  const key = requireKey(apiKey);
  const text = String(query ?? "");
  if (!text.trim()) throw new HttpError(400, "搜索词不能为空");
  const body = { query: text };
  if (count !== undefined && count !== null && count !== "") body.count = count;
  const original = presentText(oriQuestion);
  if (original) body.ori_question = original;
  const locale = presentText(localization);
  if (locale) body.localization = locale;
  if (typeof needContent === "boolean") body.need_content = needContent;
  const data = await postJson(request, SEARCH_URL, key, body);
  return Array.isArray(data.results) ? data.results : [];
}

export function publicPageUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 8192) throw new HttpError(400, "网页地址不正确");
  let url;
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

export async function deepseekFetch(pageUrl, { request = fetch, apiKey } = {}) {
  const key = requireKey(apiKey);
  const url = publicPageUrl(pageUrl);
  const data = await postJson(request, FETCH_URL, key, { url });
  return {
    title: data.title == null ? "" : String(data.title),
    url,
    content: data.content == null ? "" : String(data.content),
  };
}
