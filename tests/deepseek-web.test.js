import { test } from "node:test";
import assert from "node:assert/strict";
import { deepseekFetch, deepseekSearch, publicPageUrl } from "../server/deepseek-web.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("search and fetch forward the official request and return its payload", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith("/search")) {
      return jsonResponse({
        results: [
          {
            title: "公开页",
            url: "https://example.com/a",
            summary: "摘要",
            snippet: "短",
            rerank_score: 2.4,
            content: "",
          },
        ],
      });
    }
    return jsonResponse({ title: "公开页", content: "正".repeat(7000) });
  };
  const found = await deepseekSearch("范围口令", { apiKey: "search-key", request });
  assert.equal(found[0].snippet, "短");
  assert.equal(found[0].summary, "摘要");
  assert.equal(found[0].rerank_score, 2.4);
  const page = await deepseekFetch("https://example.com/a", { apiKey: "search-key", request });
  assert.equal(page.title, "公开页");
  assert.equal(page.content.length, 7000);
  assert.equal(page.url, "https://example.com/a");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
  assert.equal(calls[1].url, "https://api.deepseek.com/v1/tools/fetch");
  assert.match(calls[0].options.headers.Authorization, /search-key/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { query: "范围口令" });
  assert.deepEqual(JSON.parse(calls[1].options.body), { url: "https://example.com/a" });
});

test("search forwards official optional fields without tightening them", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ results: [] });
  };
  await deepseekSearch("范围口令", {
    apiKey: "search-key",
    request,
    count: 50,
    oriQuestion: "原来的问题",
    localization: "1.2.3.4",
    needContent: true,
  });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    query: "范围口令",
    count: 50,
    ori_question: "原来的问题",
    localization: "1.2.3.4",
    need_content: true,
  });
});

test("a missing search key is refused before any request", async () => {
  await assert.rejects(
    deepseekSearch("问题", {
      apiKey: "",
      request: async () => {
        throw new Error("should not call");
      },
    }),
    { status: 409 },
  );
});

test("fetch rejects addresses that are not public http pages", () => {
  assert.throws(() => publicPageUrl("file:///etc/passwd"), { status: 400 });
  assert.throws(() => publicPageUrl("https://user:secret@example.com"), { status: 400 });
});
