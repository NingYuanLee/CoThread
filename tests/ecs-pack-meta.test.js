import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitState, releaseStamp, sha256File } from "../scripts/ecs-pack.mjs";

test("产物文件名里的时间戳定宽，字典序等于时间序", () => {
  const early = releaseStamp(new Date("2026-10-22T06:34:58.123Z"));
  const late = releaseStamp(new Date("2026-11-06T12:30:47.538Z"));
  assert.match(early, /^\d{8}T\d{6}Z$/);
  assert.equal(early.length, late.length);
  assert.ok(early < late);
  assert.ok(
    `cothread-release-${early}.tgz` < `cothread-release-${late}.tgz`,
    "同目录多包时按文件名排序必须等于按时间排序",
  );
});

test("SHA-256 按流式计算，结果与标准摘要一致", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cothread-pack-sha-"));
  try {
    const file = join(dir, "sample.bin");
    writeFileSync(file, "abc");
    assert.equal(
      await sha256File(file),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("提交号取自当前 HEAD，工作区是否干净单独记录", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const state = gitState(process.cwd());
  assert.equal(state.commit, head);
  assert.match(state.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof state.dirty, "boolean");
});
