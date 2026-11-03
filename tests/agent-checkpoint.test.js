import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relocateSessionFiles, restoreSessionCheckpoint } from "../server/agent-checkpoint.js";
import { isCorruptSessionLog } from "../server/agent.js";
import { documentSummarySchema } from "../server/project-memory.js";

test("document summaries are bounded without splitting surrogate pairs", () => {
  const summary = documentSummarySchema.parse({ summary: "a".repeat(3999) + "😀 extra" }).summary;
  assert.equal(summary, "a".repeat(3999));
  assert.throws(() => documentSummarySchema.parse({ summary: "  " }));
});

test("Windows checkpoints move to Linux workspace without changing identity or historical bytes", () => {
  const id = randomUUID();
  const header = {
    type: "session",
    version: 0,
    id,
    cwd: "D:\\work\\old",
    createdAt: 1,
    delegationDepth: 0,
  };
  const events = Buffer.from('{"type":"user/message","text":"保留 D:\\\\work 历史原文"}\n');
  const files = {
    [`--D-work-old--/${id}/session.jsonl`]: Buffer.concat([
      Buffer.from(JSON.stringify(header) + "\n"),
      events,
    ]).toString("base64"),
  };
  const entries = relocateSessionFiles(files, "/tmp/cothread-agents/current");
  const [path, content] = [...entries][0];
  assert.equal(path, `--tmp-cothread-agents-current--/${id}/session.jsonl`);
  const end = content.indexOf(10);
  assert.deepEqual(JSON.parse(content.subarray(0, end)), {
    ...header,
    cwd: "/tmp/cothread-agents/current",
  });
  assert.deepEqual(content.subarray(end + 1), events);
  assert.throws(() => relocateSessionFiles({ "../outside": "" }, "/tmp/current"), /无效/);
  assert.throws(
    () =>
      relocateSessionFiles(
        { ...files, [`--duplicate--/${id}/session.jsonl`]: Object.values(files)[0] },
        "/tmp/current",
      ),
    /重复/,
  );
});

test("restore keeps durable image attachments with their session and rejects traversal", async () => {
  const home = await mkdtemp(join(tmpdir(), "cothread-attachment-"));
  try {
    const bytes = Buffer.from("image bytes");
    const files = { "_attachments/v1/images/ab/image.png": bytes.toString("base64") };
    await restoreSessionCheckpoint(files, home);
    assert.deepEqual(await readFile(join(home, "attachments/v1/images/ab/image.png")), bytes);
    const attachment = join(home, "attachments/v1/images/ab/image.png");
    await chmod(attachment, 0o444);
    await restoreSessionCheckpoint(files, home);
    await assert.rejects(
      restoreSessionCheckpoint(
        { "_attachments/v1/images/ab/image.png": Buffer.from("different").toString("base64") },
        home,
      ),
      /内容不一致/,
    );
    assert.deepEqual(await readFile(attachment), bytes);
    await chmod(attachment, 0o666);
    await assert.rejects(
      restoreSessionCheckpoint({ "_attachments/v1/../../escape": "" }, home),
      /无效/,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("corrupt DSH session logs are recognized for a one-shot reset", () => {
  assert.equal(
    isCorruptSessionLog({
      message: "corrupt session log: seq gap in committed region at line 1474",
    }),
    true,
  );
  assert.equal(isCorruptSessionLog(new Error("无效会话快照标识")), true);
  assert.equal(isCorruptSessionLog(new Error("无效会话快照头部")), true);
  assert.equal(isCorruptSessionLog(new Error("Internal error")), false);
  // DSH 0.2 migration refusals leave an intact but unusable artifact.
  assert.equal(
    isCorruptSessionLog(
      new Error(
        "format v2 surface before first step cannot acquire a system head without changing chronology; source v0 artifact remains unchanged (raw log: /tmp/session.jsonl)",
      ),
    ),
    true,
  );
  assert.equal(isCorruptSessionLog(new Error("unsupported session format generation")), true);
  assert.equal(
    isCorruptSessionLog(
      new Error(
        'session "abc": stored log is corrupt: SessionFormatError: system/message requires a protected first surface head (raw log: /tmp/session.v4.jsonl)',
      ),
    ),
    true,
  );
});
