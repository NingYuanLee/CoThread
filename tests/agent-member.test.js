import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsAgent, TASK_CREATE_REQUEST } from "../shared/agent-member.js";

test("only a complete Agent mention explicitly requires a reply", () => {
  for (const text of [
    "@小祥",
    "请帮忙 @小祥！",
    "@Agent助手",
    "@Agent助手 你好",
    "请帮忙 @Agent助手！",
    "@Agent 助手 请看看",
    "小祥，帮我写文档",
    "小祥 你好",
    TASK_CREATE_REQUEST,
  ])
    assert.equal(mentionsAgent(text), true, text);
  for (const text of [
    "普通发言",
    "小祥",
    "和小祥一起改",
    "@小祥同学",
    "mail@小祥.com",
    "@@小祥",
    "Agent助手",
    "@其他人",
    "@Agent助手长",
    "mail@Agent助手.com",
    "@@Agent助手",
  ])
    assert.equal(mentionsAgent(text), false, text);
});
