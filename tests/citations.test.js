import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annotateWebCitations,
  citationTitle,
  groupCitations,
  webCitationsInBody,
  webMarkNumber,
} from "../shared/citations.js";

test("citations collapse by type and number public web pages", () => {
  const items = [
    { id: "1", kind: "wiki", label: "入门指南", target: "page-1" },
    { id: "2", kind: "document", label: "说明 · 项目文档", target: "doc-1" },
    { id: "3", kind: "thread", label: "第一轮 · 迭代", target: "thread-1" },
    { id: "4", kind: "message", label: "第一轮 · 小祥 · 2条相关", target: "thread-1" },
    {
      id: "5",
      kind: "web",
      label: "公开页 · 公开网页",
      title: "公开页",
      target: "https://example.com/a",
    },
    {
      id: "6",
      kind: "web",
      label: "另一页 · 公开网页",
      title: "另一页",
      target: "https://example.com/b",
    },
    { id: "7", kind: "task", label: "跟进 · 任务", target: "task-1" },
    { id: "8", kind: "guide", label: "手册 · 公司指南" },
    { id: "9", kind: "guide", label: "制度 · 组织指南" },
    { id: "10", kind: "other", label: "说不清" },
    { id: "11", kind: "other", label: "也说不清" },
  ];
  const groups = groupCitations(items);
  assert.deepEqual(
    groups.map((group) => group.label + group.items.length),
    ["知识页1", "项目文档1", "迭代2", "公开网页2", "其他2", "任务1", "公司指南1", "组织指南1"],
  );
  assert.equal(citationTitle("第一轮 · 小祥 · 2条相关"), "第一轮 · 小祥");
  assert.equal(webMarkNumber(items, items[5]), 2);
  const body = annotateWebCitations(
    "可以看公开页，也可以看[另一页](https://example.com/b)。",
    items,
  );
  assert.equal(body.includes("公开页[1](https://example.com/a)"), true);
  assert.equal(body.includes("[另一页](https://example.com/b)[2](https://example.com/b)"), true);
  assert.equal(
    annotateWebCitations("没有提到标题。", items).endsWith(
      "[1](https://example.com/a)[2](https://example.com/b)",
    ),
    true,
  );
  const found = webCitationsInBody("见 [文档](https://example.com/a) 和 https://example.com/b");
  assert.deepEqual(
    found.map((item) => item.target),
    ["https://example.com/a", "https://example.com/b"],
  );
  assert.equal(webCitationsInBody("本机 http://127.0.0.1:8080/a").length, 0);
});
