import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dedupeSessionLogs,
  relocateSessionFiles,
  restoreSessionCheckpoint,
} from "../server/agent-checkpoint.js";
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

test("checkpoint restore relocates generation logs (session.vN.jsonl)", () => {
  const id = randomUUID();
  const header = {
    type: "session",
    version: 4,
    id,
    cwd: "/opt/cothread/releases/20261026T105745Z/.local/agents/laoweng-x",
    isSeeded: false,
    delegationDepth: 0,
  };
  const events = Buffer.from('{"type":"turn/end","seq":7}\n');
  const files = {
    [`--opt-cothread-releases-20261026T105745Z-.local-agents-laoweng-x--/${id}/session.v4.jsonl`]:
      Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), events]).toString("base64"),
  };
  const [[target, content]] = [
    ...relocateSessionFiles(files, "/opt/cothread/.local/agents/laoweng-x"),
  ];
  assert.equal(target, `--opt-cothread-.local-agents-laoweng-x--/${id}/session.v4.jsonl`);
  const end = content.indexOf(10);
  assert.deepEqual(JSON.parse(content.subarray(0, end)), {
    ...header,
    cwd: "/opt/cothread/.local/agents/laoweng-x",
  });
  assert.deepEqual(content.subarray(end + 1), events);
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

// 与线上故障一致：同一个 session id 在旧、新两个项目目录下各留一份日志。
const DUPLICATE_SESSION_ID = "333db0b7-5d8f-4727-9fd9-2cae37f6a595";

async function writeSessionLog(home, project, bytes) {
  const dir = join(home, "sessions", project, DUPLICATE_SESSION_ID);
  await mkdir(dir, { recursive: true });
  const header = JSON.stringify({
    type: "session",
    version: 4,
    id: DUPLICATE_SESSION_ID,
    createdAt: 1,
    cwd: "/opt/cothread/releases/OLD/.local/agents/laoweng-x",
  });
  await writeFile(
    join(dir, "session.v4.jsonl"),
    `${header}\n${"x".repeat(Math.max(0, bytes - header.length - 1))}`,
  );
  return dir;
}

test("duplicate session logs collapse onto the current home project directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "cothread-agent-home-"));
  try {
    const stale = await writeSessionLog(home, "--old-key--", 400);
    await writeSessionLog(home, "--new-key--", 4000);
    const moved = await dedupeSessionLogs(home);
    // 旧副本进 .trash，保留的那份归位到当前 home 推算出的项目目录并改写 header。
    assert.equal(moved.length, 2);
    assert.deepEqual(await readdir(join(home, "sessions", "--old-key--")), []);
    const withId = [];
    for (const project of await readdir(join(home, "sessions"))) {
      try {
        await stat(join(home, "sessions", project, DUPLICATE_SESSION_ID));
        withId.push(project);
      } catch {
        /* 旧项目目录可能留空 */
      }
    }
    assert.equal(withId.length, 1);
    const log = join(home, "sessions", withId[0], DUPLICATE_SESSION_ID, "session.v4.jsonl");
    const text = await readFile(log, "utf8");
    const [head, body] = text.split("\n");
    assert.equal(JSON.parse(head).cwd, home);
    assert.match(body, /^x+$/);
    assert.equal(
      moved.some((item) => item.from === stale),
      true,
    );
    assert.deepEqual(await dedupeSessionLogs(home), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a single log under a stale project directory is relocated, dry-run moves nothing", async () => {
  const home = await mkdtemp(join(tmpdir(), "cothread-agent-home-"));
  try {
    const stale = await writeSessionLog(home, "--only--", 1000);
    const planned = await dedupeSessionLogs(home, { dryRun: true });
    assert.equal(planned.length, 1);
    assert.equal((await readFile(join(stale, "session.v4.jsonl"), "utf8")).length, 1000);
    assert.deepEqual(await readdir(join(home, "sessions")), ["--only--"]);
    assert.equal((await dedupeSessionLogs(home)).length, 1);
    const withId = [];
    for (const project of await readdir(join(home, "sessions"))) {
      try {
        await stat(join(home, "sessions", project, DUPLICATE_SESSION_ID));
        withId.push(project);
      } catch {
        /* 旧项目目录可能留空 */
      }
    }
    assert.equal(withId.length, 1);
    assert.notEqual(withId[0], "--only--");
    assert.deepEqual(await dedupeSessionLogs(home), []);
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
