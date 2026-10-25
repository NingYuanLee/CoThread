import { test } from "node:test";
import assert from "node:assert/strict";
import { contextInjectionFromEvent } from "../shared/context-injection.js";

const userEvent = (source, text) => ({
  type: "user/message",
  data: { source, content: [{ type: "text", text }] },
});

test("工作区规则注入：system-agents-md 带 kind/form/summary", () => {
  const injection = contextInjectionFromEvent(
    userEvent(
      { kind: "system-agents-md", form: "notice", summary: "6 steps without visible text" },
      "你已经连续 6 步没有向用户说明进展。",
    ),
  );
  assert.equal(injection.text, "你已经连续 6 步没有向用户说明进展。");
  assert.equal(injection.source.kind, "system-agents-md");
  assert.equal(injection.source.form, "notice");
});

test("行为提醒：只靠 form=notice 也能识别", () => {
  const injection = contextInjectionFromEvent(
    userEvent({ kind: "progress", form: "notice" }, "提醒文本"),
  );
  assert.equal(injection.text, "提醒文本");
});

test("普通用户消息与模型输出不算注入", () => {
  assert.equal(contextInjectionFromEvent(userEvent({ kind: "user" }, "你好")), null);
  assert.equal(
    contextInjectionFromEvent({
      type: "assistant/message",
      data: { message: { source: { kind: "model" }, content: [{ type: "text", text: "回答" }] } },
    }),
    null,
  );
  assert.equal(contextInjectionFromEvent(null), null);
});

test("注入正文按块拼接，图片成为占位", () => {
  const injection = contextInjectionFromEvent({
    type: "user/message",
    data: {
      source: { kind: "system-agents-md", form: "notice" },
      content: [
        { type: "text", text: "第一段" },
        { type: "image" },
        { type: "text", text: "第二段" },
      ],
    },
  });
  assert.equal(injection.text, "第一段\n（image）\n第二段");
});
