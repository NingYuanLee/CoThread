import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFileIndex } from "../server/file-index-format.ts";

test("暂不支持文件只显示已知元数据，不把文件名当成内容摘要", () => {
  const body = renderFileIndex({
    filename: "产品设计.bin",
    mime: "application/octet-stream",
    version: 2,
  });
  assert.match(body, /文件：产品设计\.bin/);
  assert.match(body, /暂无内容说明/);
  assert.match(body, /暂不支持/);
  assert.doesNotMatch(body, /## 识别文字/);
});

test("提取文字和模型说明分开记录，识别部分注明缺口", () => {
  const body = renderFileIndex({
    summary: "画面是注册页面",
    extractedText: "注册账号",
    status: "partial",
    reason: "图表未识别",
  });
  assert.match(body, /## 这是什么\n画面是注册页面/);
  assert.match(body, /## 识别文字（需核对原文件）\n注册账号/);
  assert.match(body, /识别部分/);
  assert.match(body, /图表未识别/);
  assert.throws(() => renderFileIndex({ status: "done" }), /无效的文件识别状态/);
});
