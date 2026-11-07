import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const supported = /\.(?:cjs|js|jsx|mjs|mts|ts|tsx|json)$/i;
const ignored = new Set(["package-lock.json"]);

function git(args, cwd) {
  return execFileSync("git", args, { encoding: "utf8", cwd })
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** 引用在本地是否存在（远端分支或提交）。 */
function refExists(ref, cwd) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

/**
 * 取 push 事件里「本次推送之前的提交」。
 *
 * GitHub Actions 并没有名为 GITHUB_EVENT_BEFORE 的标准环境变量：标准做法是从事件负载读，
 * 即 GITHUB_EVENT_PATH 指向的 JSON 里的 `before`。两个都支持，但权威来源是事件负载——
 * GITHUB_EVENT_BEFORE 只是显式覆盖入口（自建流水线、本地验证或测试用），
 * 不要把它当成 GitHub 默认注入的变量。
 */
export function pushBefore(env) {
  const direct = String(env.GITHUB_EVENT_BEFORE ?? "").trim();
  if (direct) return direct;
  const payloadPath = String(env.GITHUB_EVENT_PATH ?? "").trim();
  if (!payloadPath || !existsSync(payloadPath)) return null;
  try {
    const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
    const before = payload?.before;
    return typeof before === "string" ? before : null;
  } catch {
    return null;
  }
}

/**
 * CI 下比较基准（diff 的左端）：
 * - pull_request：GITHUB_BASE_REF 由 GitHub 在 PR 事件里给出，用 origin/<base>。
 * - push：GITHUB_BASE_REF 不会被设置，必须用本次推送之前的提交（before）；
 *   否则 HEAD^...HEAD 只覆盖最后一次提交，多次推送的改动会漏检。
 *   before 不可用时回退到默认分支比较——这是近似范围：得到的是「相对默认分支」的改动，
 *   不是「本次推送」的精确范围（before 缺失的两种情形：推送新分支时 before 是全零 SHA；
 *   force-push 后该提交已不在本地），只用于兜底，不能当精确的本次推送范围看。
 */
export function resolveCiRange(env, cwd) {
  const baseRef = String(env.GITHUB_BASE_REF ?? "").trim();
  if (baseRef) {
    const base = `origin/${baseRef}`;
    return { range: `${base}...HEAD`, source: base };
  }
  const before = pushBefore(env);
  if (before && !/^0+$/.test(before) && refExists(before, cwd)) {
    return { range: `${before}...HEAD`, source: `push before ${before}` };
  }
  for (const candidate of ["origin/main", "origin/master", "origin/HEAD"]) {
    if (refExists(candidate, cwd)) return { range: `${candidate}...HEAD`, source: candidate };
  }
  return null;
}

/**
 * 需要做格式检查的文件集合。
 * 本地（非 CI）走未提交改动：工作区差异 + 暂存差异 + 未跟踪文件。
 * CI 上工作区是干净的，改用与比较基准之间的提交差异。
 */
export function collectChangedFiles({ env = process.env, cwd = process.cwd() } = {}) {
  const changed = new Set();
  for (const name of git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"], cwd))
    changed.add(name);
  for (const name of git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], cwd))
    changed.add(name);
  for (const name of git(["ls-files", "--others", "--exclude-standard"], cwd)) changed.add(name);

  if (env.CI && changed.size === 0) {
    const range = resolveCiRange(env, cwd);
    if (range) {
      for (const name of git(["diff", "--name-only", "--diff-filter=ACMR", range.range], cwd))
        changed.add(name);
    } else {
      console.log("CI 下无法确定比较基准，已跳过按提交范围的格式检查。");
    }
  }
  return [...changed];
}

function main() {
  const changed = collectChangedFiles();
  const files = changed
    .filter((name) => supported.test(name) && !ignored.has(name) && existsSync(resolve(name)))
    .sort();

  if (!files.length) {
    console.log("没有需要检查的格式文件。");
    process.exit(0);
  }

  const prettier = resolve("node_modules/prettier/bin/prettier.cjs");
  const result = spawnSync(process.execPath, [prettier, "--check", ...files], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
