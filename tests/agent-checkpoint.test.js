import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { relocateSessionFiles } from "../server/agent-checkpoint.js";

test("Windows checkpoints move to Linux workspace without changing identity or historical bytes", () => {
  const id = randomUUID();
  const header = { type: "session", version: 0, id, cwd: "D:\\work\\old", createdAt: 1, delegationDepth: 0 };
  const events = Buffer.from('{"type":"user/message","text":"保留 D:\\\\work 历史原文"}\n');
  const files = { [`--D-work-old--/${id}/session.jsonl`]: Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), events]).toString("base64") };
  const entries = relocateSessionFiles(files, "/tmp/cothread-agents/current");
  const [path, content] = [...entries][0];
  assert.equal(path, `--tmp-cothread-agents-current--/${id}/session.jsonl`);
  const end = content.indexOf(10);
  assert.deepEqual(JSON.parse(content.subarray(0, end)), { ...header, cwd: "/tmp/cothread-agents/current" });
  assert.deepEqual(content.subarray(end + 1), events);
  assert.throws(() => relocateSessionFiles({ "../outside": "" }, "/tmp/current"), /无效/);
  assert.throws(() => relocateSessionFiles({ ...files, [`--duplicate--/${id}/session.jsonl`]: Object.values(files)[0] }, "/tmp/current"), /重复/);
});
