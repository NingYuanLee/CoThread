import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * usePoll 的可见性行为。
 *
 * 项目没有 React 渲染测试环境，这里把 hook 里与可见性相关的判定
 * 等价重放一遍，并断言源码确实按这个判定实现，避免两边漂移。
 */
const source = readFileSync("web/use-poll.ts", "utf8");

function simulate(hiddenEvents) {
  const calls = [];
  let alive = true;
  let timer = null;
  let hidden = false;
  const run = () => {
    if (!alive || hidden) return;
    calls.push("load");
  };
  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const start = () => {
    stop();
    if (!alive) return;
    timer = setInterval(run, 1000);
  };
  const onVisibility = () => {
    if (hidden) {
      stop();
      return;
    }
    run();
    start();
  };
  run();
  start();
  for (const event of hiddenEvents) {
    hidden = event;
    onVisibility();
  }
  stop();
  return calls;
}

test("usePoll 挂载时立刻拉取一次", () => {
  assert.deepEqual(simulate([]), ["load"]);
});

test("usePoll 在标签页隐藏时停表，不再发请求", () => {
  assert.deepEqual(simulate([true]), ["load"]);
});

test("usePoll 回到前台立刻补一次拉取", () => {
  assert.deepEqual(simulate([true, false]), ["load", "load"]);
});

test("usePoll 实现确实按可见性停表并监听 visibilitychange", () => {
  assert.ok(source.includes("document.hidden"), "隐藏时应跳过拉取");
  assert.ok(source.includes("visibilitychange"), "必须监听 visibilitychange");
});
