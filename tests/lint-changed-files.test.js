import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectChangedFiles, resolveCiRange } from "../scripts/lint.js";

/**
 * CI 里格式检查的改动范围。
 *
 * GitHub 只在 pull_request 事件设置 GITHUB_BASE_REF；push 事件里它不存在。
 * 旧逻辑因此回退到 HEAD^...HEAD，只覆盖最后一次提交，多次推送的改动会漏检。
 * 这里在临时仓库里造 3 个提交，分别模拟 push 与 pull_request 两种事件。
 *
 * 仓库只造一次：各用例只读它，避免在全量套件里反复起 git 进程拖慢并发调度。
 */

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createFixture() {
  const work = mkdtempSync(join(tmpdir(), "cothread-lint-work-"));
  const remote = mkdtempSync(join(tmpdir(), "cothread-lint-remote-"));
  git(["init", "-q", "-b", "main"], work);
  git(["config", "user.email", "lint-test@example.com"], work);
  git(["config", "user.name", "lint test"], work);
  git(["config", "commit.gpgsign", "false"], work);

  writeFileSync(join(work, "base.txt"), "base\n");
  git(["add", "-A"], work);
  git(["commit", "-q", "-m", "c1"], work);
  const first = git(["rev-parse", "HEAD"], work);

  git(["init", "-q", "--bare", remote], work);
  git(["remote", "add", "origin", remote], work);
  git(["push", "-q", "origin", "main"], work);

  git(["checkout", "-q", "-b", "feature"], work);
  writeFileSync(join(work, "base.txt"), "base changed\n");
  writeFileSync(join(work, "added-b.txt"), "b\n");
  git(["add", "-A"], work);
  git(["commit", "-q", "-m", "c2"], work);
  writeFileSync(join(work, "added-c.txt"), "c\n");
  git(["add", "-A"], work);
  git(["commit", "-q", "-m", "c3"], work);

  return { work, remote, first };
}

let fixture;

before(() => {
  fixture = createFixture();
});

after(() => {
  rmSync(fixture.work, { recursive: true, force: true });
  rmSync(fixture.remote, { recursive: true, force: true });
});

const allChanged = ["added-b.txt", "added-c.txt", "base.txt"];

test("push 事件按本次推送涉及的全部提交计算改动范围", () => {
  const range = resolveCiRange({ CI: "1", GITHUB_EVENT_BEFORE: fixture.first }, fixture.work);
  assert.equal(range.range, `${fixture.first}...HEAD`);
  const files = collectChangedFiles({
    env: { CI: "1", GITHUB_EVENT_BEFORE: fixture.first },
    cwd: fixture.work,
  });
  assert.deepEqual(files.sort(), allChanged);
  // 旧行为（HEAD^...HEAD）只看得到最后一次提交
  const headOnly = git(
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD^...HEAD"],
    fixture.work,
  ).split(/\r?\n/);
  assert.deepEqual(headOnly, ["added-c.txt"]);
});

test("push 事件从事件负载里取 before", () => {
  // 事件负载放在仓库外：放在仓库里会成为未跟踪文件，走本地那条路径。
  const payload = join(fixture.remote, "event.json");
  writeFileSync(payload, JSON.stringify({ before: fixture.first }));
  const files = collectChangedFiles({
    env: { CI: "1", GITHUB_EVENT_PATH: payload },
    cwd: fixture.work,
  });
  assert.deepEqual(files.sort(), allChanged);
});

test("push 事件拿不到 before 时回退到默认分支比较", () => {
  const zero = resolveCiRange({ CI: "1", GITHUB_EVENT_BEFORE: "0".repeat(40) }, fixture.work);
  assert.equal(zero.range, "origin/main...HEAD");
  const fallback = resolveCiRange({ CI: "1" }, fixture.work);
  assert.equal(fallback.range, "origin/main...HEAD");
  const files = collectChangedFiles({ env: { CI: "1" }, cwd: fixture.work });
  assert.deepEqual(files.sort(), allChanged);
});

test("pull_request 事件仍按目标分支比较", () => {
  const range = resolveCiRange({ CI: "1", GITHUB_BASE_REF: "main" }, fixture.work);
  assert.equal(range.range, "origin/main...HEAD");
  const files = collectChangedFiles({
    env: { CI: "1", GITHUB_BASE_REF: "main" },
    cwd: fixture.work,
  });
  assert.deepEqual(files.sort(), allChanged);
});

test("非 CI 环境仍走未提交改动，工作区干净时没有待检查文件", () => {
  const files = collectChangedFiles({ env: {}, cwd: fixture.work });
  assert.deepEqual(files, []);
});
