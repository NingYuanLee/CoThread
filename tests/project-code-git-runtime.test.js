import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  codeMirrorBase, formatGitFailure, parseGithubOwnerRepo,
} from "../server/project-code-sources.js";

test("code mirror base uses cwd/.local", () => {
  assert.equal(codeMirrorBase(), resolve(".local", "code-mirrors"));
});

test("git failure detail surfaces spawn errors and redacts credentials", () => {
  assert.equal(
    formatGitFailure({ status: 1, stderr: "", stdout: "", error: new Error("spawn git ENOENT") }),
    "读取代码库失败：spawn git ENOENT | exit 1",
  );
  const message = formatGitFailure({
    status: 128,
    stderr: "fatal: Authentication failed for 'https://x-access-token:ghp_secret@github.com/a/b.git/'",
  });
  assert.match(message, /x-access-token:\*\*\*@/);
  assert.doesNotMatch(message, /ghp_secret/);
});

test("parseGithubOwnerRepo accepts https, ssh and label", () => {
  assert.deepEqual(
    parseGithubOwnerRepo("https://github.com/NingYuanLee/CoThread.git", ""),
    { owner: "NingYuanLee", repo: "CoThread" },
  );
  assert.deepEqual(
    parseGithubOwnerRepo("git@github.com:NingYuanLee/CoThread.git", ""),
    { owner: "NingYuanLee", repo: "CoThread" },
  );
  assert.deepEqual(
    parseGithubOwnerRepo("", "NingYuanLee/CoThread"),
    { owner: "NingYuanLee", repo: "CoThread" },
  );
});
