import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  COTHREAD_BANNER,
  COTHREAD_GREETING,
  formatDevLogContinuation,
  formatDevLogLine,
  highlightDevLogBody,
  inferDevLogKind,
  isDevLogContinuation,
  isViteDevLog,
  renderDevBanner,
  stripAnsi,
  updateDevLogBlockDepth,
  visibleWidth,
  writeDevBanner,
} from "../scripts/dev-log.js";
import {
  attachChildOutput,
  createDevProgress,
  extractWarmupUrls,
  normalizeWarmupUrl,
  renderDevProgress,
  renderDevProgressBar,
  warmDevFrontend,
  warmupCrawlPercent,
} from "../scripts/dev-progress.js";

const clock = () => new Date(2026, 8, 21, 18, 22, 1);

test("dev log lines carry a timestamp and [Cothread] tag", () => {
  const line = formatDevLogLine("Vite 已启动", { now: clock() });
  assert.equal(line, "18:22:01 [Cothread] [启动]  Vite 已启动");
  const colored = formatDevLogLine("Vite 已启动", { now: clock(), color: true });
  assert.match(colored, /\u001b\[38;2;183;210;149m\[Cothread\]\u001b\[0m/);
  assert.match(colored, /\[启动\]/);
  assert.equal(stripAnsi(colored), line);
});

test("key phrases urls and progress blocks are highlighted", () => {
  const body =
    "共序开发已就绪：http://127.0.0.1:3100  10%  [██░]  admin@cothread.local  .local/mysql-data";
  const painted = highlightDevLogBody(body, { color: true });
  assert.equal(stripAnsi(painted), body);
  assert.match(painted, /\u001b\[4m/);
  assert.match(painted, /http:\/\/127\.0\.0\.1:3100/);
  assert.match(painted, /admin@cothread\.local/);
  assert.equal(highlightDevLogBody(body, { color: false }), body);
  const password = highlightDevLogBody("xK7mP2qR9sLw4nQ8", { color: true });
  assert.match(password, /^\u001b\[1m\u001b\[33mxK7mP2qR9sLw4nQ8\u001b\[0m$/);
  assert.equal(stripAnsi(password), "xK7mP2qR9sLw4nQ8");
  const resetPassword = highlightDevLogBody(
    "已有超级管理员 admin@cothread.local 密码已重置：cothread-dev",
    { color: true },
  );
  assert.match(resetPassword, /\u001b\[1m\u001b\[33mcothread-dev\u001b\[0m$/);
  assert.equal(
    stripAnsi(resetPassword),
    "已有超级管理员 admin@cothread.local 密码已重置：cothread-dev",
  );
});

test("startup lines are classified by kind", () => {
  assert.equal(inferDevLogKind(COTHREAD_GREETING), "hello");
  assert.equal(inferDevLogKind("MySQL 已运行于 127.0.0.1:3307"), "check");
  assert.equal(inferDevLogKind("正在检查本机便携版 MySQL（127.0.0.1:3307）是否在监听…"), "check");
  assert.equal(inferDevLogKind("未发现需要停止的旧进程。"), "check");
  assert.equal(inferDevLogKind("开发数据库目标：dev"), "check");
  assert.equal(inferDevLogKind("停止旧进程 1234：node scripts/dev.js"), "check");
  assert.equal(inferDevLogKind("发现旧进程 1234：node scripts/dev.js"), "check");
  assert.equal(inferDevLogKind("已停止旧进程 1234。"), "check");
  assert.equal(inferDevLogKind("Vite 已启动：http://127.0.0.1:3102"), "start");
  assert.equal(inferDevLogKind("coThread Server 已启动：http://127.0.0.1:3101"), "start");
  assert.equal(inferDevLogKind("已有超级管理员 admin@cothread.local 密码已重置"), "check");
  assert.equal(inferDevLogKind("abcdefghijklmnop"), "check");
  assert.equal(inferDevLogKind("初始超级管理员已创建。账号：admin@cothread.local"), "check");
  assert.equal(inferDevLogKind("初始密码：secret"), "check");
  assert.equal(inferDevLogKind("跳过初始超级管理员：请运行 npm run setup"), "check");
  assert.equal(inferDevLogKind("共序开发已就绪：http://127.0.0.1:3100"), "ready");
  assert.equal(inferDevLogKind("前端预热失败（可忽略，首屏可能稍慢）"), "warn");
  assert.equal(inferDevLogKind("Server 进程已退出。"), "error");
  assert.equal(inferDevLogKind("Coordinator request failed {"), "error");
  assert.equal(inferDevLogKind("Opportunistic participation crashed {"), "error");
  assert.equal(inferDevLogKind("Agent session log corrupt, resetting {"), "error");
  assert.equal(inferDevLogKind("Automatic compaction skipped {"), "warn");
  assert.equal(inferDevLogKind("DSH composition unavailable {"), "warn");
  assert.equal(inferDevLogKind("Agent timing {"), "log");
  assert.equal(inferDevLogKind("Participation decision {"), "log");
  assert.equal(
    formatDevLogLine("已有超级管理员 admin@cothread.local", { now: clock() }),
    "18:22:01 [Cothread] [检查]  已有超级管理员 admin@cothread.local",
  );
});

test("wide characters count as two columns", () => {
  assert.equal(visibleWidth("进度"), 4);
  assert.equal(visibleWidth("abc"), 3);
  assert.equal(visibleWidth("已变更："), 8);
});

test("long error lines wrap before a checksum instead of inside it", () => {
  const applied = "13a6eea5429c8f8aa2dbf0f6aeecfef27a5cb6e8730049380eeed62c41431eed";
  const current = "dadf5ac0145ab4987bff380d75880719a3394f21066de2b95808f32f4b81048b";
  const text = `Error: 迁移文件 101_project_builtin_roles.sql 已变更：数据库 checksum=${applied}，当前文件 checksum=${current}`;
  const formatted = formatDevLogLine(text, {
    now: clock(),
    columns: 100,
    kind: "error",
    level: "error",
  });
  const lines = formatted.split("\n");
  assert.equal(lines.filter((line) => line.includes("[Cothread]")).length, 1);
  assert.equal(
    formatDevLogLine("Vite 已启动", { now: clock(), columns: 100 }),
    "18:22:01 [Cothread] [启动]  Vite 已启动",
  );
  for (const line of lines) assert.ok(visibleWidth(line) <= 99, line);
  assert.ok(lines.some((line) => line.includes(applied)));
  assert.ok(lines.some((line) => line.includes(current)));
  assert.equal(formatted.includes(`${applied.slice(0, 20)}\n`), false);
});

test("tty progress label stays inside the terminal width", () => {
  const chunks = [];
  const stream = {
    isTTY: true,
    columns: 100,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(
    19,
    "编译 /web/components/very/long/WorkspaceCanvas.tsx 以及更多不会塞进这一行的路径",
  );
  const line = stripAnsi(chunks.at(-1)).replace(/^\r/, "").trimEnd();
  assert.ok(visibleWidth(line) < 100, line);
  assert.match(line, /19%/);
  assert.equal(line.includes("WorkspaceCanvas.tsx 以及更多不会塞进这一行的路径"), false);
});

test("multi-line logs only prefix the first line", () => {
  const block = "Agent timing {\n  messageId: 'm1',\n  stage: 'claimed'\n}";
  const formatted = formatDevLogLine(block, { now: clock() });
  assert.equal(
    formatted,
    [
      "18:22:01 [Cothread] [日志]",
      "Agent timing {",
      "  messageId: 'm1',",
      "  stage: 'claimed'",
      "}",
    ].join("\n"),
  );
  assert.equal(formatted.split("\n").filter((line) => line.includes("[Cothread]")).length, 1);
  assert.equal(
    formatDevLogContinuation("  messageId: 'm1',", { now: clock() }),
    "  messageId: 'm1',",
  );
  assert.equal(
    formatDevLogLine("Agent timing {", { now: clock() }),
    "18:22:01 [Cothread] [日志]\nAgent timing {",
  );
  assert.equal(isDevLogContinuation("  messageId: 'm1',"), true);
  assert.equal(isDevLogContinuation("}"), true);
  assert.equal(isDevLogContinuation("Agent timing {"), false);
  assert.equal(updateDevLogBlockDepth(0, "Agent timing {"), 1);
  assert.equal(updateDevLogBlockDepth(1, "}"), 0);
});

test("child object dumps keep one prefix across indented lines", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: false, clock, color: false });
  const child = {
    stdout: {
      setEncoding() {},
      on(event, handler) {
        if (event !== "data") return;
        handler("Agent timing {\n  messageId: 'm1',\n  stage: 'claimed'\n}\n");
      },
    },
    stderr: null,
  };
  attachChildOutput(child, progress);
  const output = chunks.join("");
  assert.equal((output.match(/\[日志\]/g) || []).length, 1);
  assert.match(output, /18:22:01 \[Cothread\] \[日志\]\nAgent timing \{\n/);
  assert.match(output, /\n  messageId: 'm1',\n/);
  assert.match(output, /\n\}\n/);
  const blockStart = output.indexOf("Agent timing {");
  const blockEnd = output.indexOf("\n}", blockStart);
  assert.equal(output.slice(blockStart, blockEnd).includes("[进度]"), false);
});

test("application failure dumps are tagged as errors, degradations as warnings", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: false, clock, color: false });
  const child = {
    stdout: { setEncoding() {}, on() {} },
    stderr: {
      setEncoding() {},
      on(event, handler) {
        if (event !== "data") return;
        handler(
          "Coordinator request failed {\n  messageId: null,\n  type: 'TypeError'\n}\nAutomatic compaction skipped {\n  threadId: 't1'\n}\n",
        );
      },
    },
  };
  attachChildOutput(child, progress);
  const output = chunks.join("");
  assert.equal((output.match(/\[错误\]/g) || []).length, 1);
  assert.equal((output.match(/\[警告\]/g) || []).length, 1);
  assert.equal(output.includes("[日志]"), false);
  assert.match(output, /\[错误\]\nCoordinator request failed \{/);
  assert.match(output, /\[警告\]\nAutomatic compaction skipped \{/);
});

test("tty progress stays outside an agent timing dump", () => {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(19, "等待接口就绪");
  let pending;
  let onData;
  const child = {
    stdout: {
      setEncoding() {},
      on(event, handler) {
        if (event === "data") onData = handler;
      },
    },
    stderr: null,
  };
  attachChildOutput(child, progress, {
    schedule(fn) {
      pending = fn;
      return 1;
    },
    cancel() {
      pending = undefined;
    },
  });
  onData(
    "Agent timing {\n  threadId: 'e4330be5-a1cc-4b8c-911f-adebc8e3560f',\n  stage: 'runtime_setup',\n",
  );
  progress.set(42, "编译前端");
  assert.equal(chunks.join("").includes("42%"), false);
  assert.equal(typeof pending, "function");
  onData("  durationMs: 39,\n  kind: 'context_sync'\n}\n");
  assert.equal(pending, undefined);
  const output = chunks.join("");
  const blockStart = output.indexOf("Agent timing {");
  const blockEnd = output.indexOf("\n}", blockStart);
  assert.ok(blockStart > -1 && blockEnd > blockStart, output);
  const inside = output.slice(blockStart, blockEnd);
  assert.equal(inside.includes("[进度]"), false, inside);
  assert.equal(inside.includes("%"), false, inside);
  assert.match(inside, /threadId: 'e4330be5-a1cc-4b8c-911f-adebc8e3560f'/);
  assert.match(inside, /stage: 'runtime_setup'/);
  assert.match(inside, /kind: 'context_sync'/);
  assert.equal((output.match(/\[进度\]/g) || []).length, 2);
  assert.match(output, /\}\n\r?[^\n]*42%[^\n]*编译前端/);
});

test("an unclosed object dump gives the progress bar back", () => {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(19, "等待接口就绪");
  let pending;
  let onData;
  const child = {
    stdout: {
      setEncoding() {},
      on(event, handler) {
        if (event === "data") onData = handler;
      },
    },
    stderr: null,
  };
  attachChildOutput(child, progress, {
    schedule(fn) {
      pending = fn;
      return 1;
    },
    cancel() {
      pending = undefined;
    },
  });
  onData("Agent timing {\n  stage: 'runtime_setup',\n");
  progress.set(40, "编译前端");
  const mid = chunks.join("");
  assert.match(mid, /Agent timing \{\n  stage: 'runtime_setup',\n/);
  assert.equal(mid.includes("40%"), false, mid);
  assert.equal(typeof pending, "function");
  pending();
  pending = undefined;
  const done = chunks.join("");
  assert.match(done, /40%[^\n]*编译前端/);
  assert.equal(
    done
      .slice(done.indexOf("Agent timing {"), done.indexOf("stage: 'runtime_setup'"))
      .includes("[进度]"),
    false,
  );
});

test("vite's own log is not wrapped in another Cothread line", () => {
  const colored =
    "\u001b[2m11:03:36\u001b[22m \u001b[1m\u001b[36m[vite]\u001b[39m\u001b[22m (client) Re-optimizing dependencies because lockfile has changed";
  assert.equal(isViteDevLog(colored), true);
  assert.equal(updateDevLogBlockDepth(0, colored), 0);
  const chunks = [];
  const stream = {
    isTTY: true,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(19, "等待接口就绪");
  const child = {
    stdout: {
      setEncoding() {},
      on(event, handler) {
        if (event !== "data") return;
        handler(`${colored}\nVite 已启动：http://127.0.0.1:3102（浏览器经 3100）\n`);
      },
    },
    stderr: null,
  };
  attachChildOutput(child, progress);
  const output = chunks.join("");
  assert.equal(output.includes("[Cothread] [日志]"), false);
  assert.ok(output.includes(colored));
  assert.match(
    output,
    /18:22:01 \[Cothread\] \[启动\] {2}Vite 已启动：http:\/\/127\.0\.0\.1:3102（浏览器经 3100）/,
  );
  const viteAt = output.indexOf("[vite]");
  const startedAt = output.indexOf("Vite 已启动");
  assert.ok(viteAt > -1 && startedAt > viteAt);
  assert.equal(output.slice(viteAt, output.indexOf("\n", viteAt)).includes("[Cothread]"), false);
});

test("startup banner spells Cothread and greets", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(text) {
      chunks.push(text);
    },
  };
  writeDevBanner(stream, { color: false, now: clock() });
  const output = chunks.join("");
  assert.ok(COTHREAD_BANNER.every((line) => output.includes(line)));
  assert.match(output, /Cothread|____\/___/);
  assert.equal(chunks.at(-1), `18:22:01 [Cothread] [招呼]  ${COTHREAD_GREETING}\n`);
  assert.match(renderDevBanner({ color: true }), /\u001b\[38;2;183;210;149m/);
});

test("progress bar stays below 100 until finish", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: false, clock, color: false });
  progress.set(100, "不该满");
  assert.match(chunks.at(-1), /18:22:01 \[Cothread\] \[进度\] {2}\[.+\]  99% {2}不该满\n$/);
  progress.finish("ready-url");
  assert.match(chunks.at(-2), /\[进度\].*100%  浏览器可打开/);
  assert.equal(chunks.at(-1), "18:22:01 [Cothread] [就绪]  ready-url\n");
  progress.set(12, "已结束不再更新");
  assert.equal(chunks.filter((line) => line.includes("已结束")).length, 0);
});

test("progress renderer uses a fixed-width block bar", () => {
  const line = renderDevProgress(50, "等待 Vite");
  assert.match(line, /^\[[█░]+\]  50%  等待 Vite$/);
  assert.equal(line.indexOf("]") - line.indexOf("["), 29);
  assert.equal(renderDevProgress(0, "准备").includes("█"), false);
  assert.equal(renderDevProgress(100, "完成").includes("░"), false);
});

test("in-progress bars animate the head and spinner", () => {
  const still = renderDevProgress(10, "确认数据库");
  const frame0 = renderDevProgress(10, "确认数据库", { animated: true, frame: 0 });
  const frame1 = renderDevProgress(10, "确认数据库", { animated: true, frame: 1 });
  const done = renderDevProgress(100, "浏览器可打开", { animated: true, frame: 7 });
  assert.notEqual(frame0, still);
  assert.notEqual(frame0, frame1);
  assert.match(frame0, /[▓▒]/);
  assert.match(frame0, /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/);
  assert.equal(renderDevProgressBar(10, { animated: true, frame: 0 }).length, 28);
  assert.equal(renderDevProgressBar(10, { animated: true, frame: 1 }).length, 28);
  assert.equal(done.includes("░"), false);
  assert.doesNotMatch(done, /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/);
});

test("tty progress motion ticks until finish", () => {
  const chunks = [];
  let tick;
  let cleared = 0;
  const stream = {
    isTTY: true,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({
    stream,
    tty: true,
    clock,
    color: false,
    interval(fn) {
      tick = fn;
      return 1;
    },
    clearTimer() {
      cleared += 1;
      tick = undefined;
    },
  });
  progress.set(10, "确认数据库");
  const before = chunks.at(-1);
  tick();
  const after = chunks.at(-1);
  assert.notEqual(after, before);
  progress.finish("ready-url");
  assert.equal(tick, undefined);
  assert.equal(cleared, 1);
  assert.match(chunks.join(""), /100%  浏览器可打开/);
  assert.match(chunks.at(-1), /\[就绪\]  ready-url\n/);
});

test("progress notes keep the same timestamped prefix", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: false, clock, color: false, banner: true });
  progress.note("MySQL 已运行于 127.0.0.1:3307");
  assert.ok(chunks[0].includes(COTHREAD_BANNER[0]));
  assert.equal(chunks.at(-2), "18:22:01 [Cothread] [检查]  MySQL 已运行于 127.0.0.1:3307\n");
});

test("tty notes keep one live progress line instead of repeating it", () => {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(text) {
      chunks.push(text);
    },
  };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(10, "确认数据库");
  progress.note("MySQL 已运行于 127.0.0.1:3307，数据位于项目 .local/mysql-data。");
  progress.note("已有超级管理员");
  const output = chunks.join("");
  assert.equal(output.includes("确认数据库\n"), false);
  assert.equal(output.split("\n").length - 1, 2);
  assert.match(output, /MySQL 已运行于[\s\S]*已有超级管理员/);
  assert.match(output, /已有超级管理员\n\r[^\n]*确认数据库$/);
});

test("warmup url extraction follows browser module refs only", () => {
  assert.equal(normalizeWarmupUrl("/web/main.tsx?t=1"), "/web/main.tsx");
  assert.equal(normalizeWarmupUrl("https://cdn.example/x.js"), null);
  assert.equal(normalizeWarmupUrl("/api/health"), null);
  assert.deepEqual(
    extractWarmupUrls(
      `
      <link rel="modulepreload" href="/web/main.tsx"/>
      <script type="module" src="/web/App.tsx"></script>
      import "/@vite/client";
      import { App } from "/web/App.tsx";
      import("./WorkspaceApp.tsx");
      from "https://esm.sh/react";
    `,
      "/web/main.tsx",
    ),
    ["/web/main.tsx", "/web/App.tsx", "/@vite/client", "/web/WorkspaceApp.tsx"],
  );
});

test("warmup crawl percent never reports 100", () => {
  assert.equal(warmupCrawlPercent(0), 58);
  assert.ok(warmupCrawlPercent(8) > 58);
  assert.equal(warmupCrawlPercent(10_000), 99);
});

test("warmDevFrontend follows the module graph before resolving", async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<script type="module" src="/web/main.tsx"></script>`);
      return;
    }
    if (req.url === "/web/main.tsx") {
      res.end(`import { App } from "/web/App.tsx"; import "./leaf.ts"`);
      return;
    }
    if (req.url === "/web/App.tsx") {
      res.end(`export const App = 1; import("/web/WorkspaceApp.tsx")`);
      return;
    }
    if (req.url === "/web/leaf.ts" || req.url === "/web/WorkspaceApp.tsx") {
      res.end("export default 1");
      return;
    }
    res.statusCode = 404;
    res.end("missing");
  });
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  try {
    const result = await warmDevFrontend(`http://127.0.0.1:${port}`, { concurrency: 3 });
    assert.equal(result.completed, 5);
    assert.ok(hits.includes("/web/WorkspaceApp.tsx"));
    assert.ok(hits.includes("/web/leaf.ts"));
  } finally {
    server.close();
  }
});

test("warmDevFrontend retries 503 and does not crawl prebundled deps", async () => {
  const hits = [];
  let reactHits = 0;
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === "/") {
      res.end(`<script type="module" src="/web/main.tsx"></script>`);
      return;
    }
    if (req.url === "/web/main.tsx") {
      res.end(`import "react-dom" from "/node_modules/.vite/deps/react-dom.js"`);
      return;
    }
    if (req.url === "/node_modules/.vite/deps/react-dom.js") {
      reactHits += 1;
      if (reactHits < 3) {
        res.statusCode = 503;
        res.end("frontend unavailable");
        return;
      }
      res.end(`href="/missing-from-bundle.js"; import "/web/should-not.ts"`);
      return;
    }
    res.statusCode = 404;
    res.end("missing");
  });
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  try {
    const result = await warmDevFrontend(`http://127.0.0.1:${port}`, {
      concurrency: 2,
      retryDelayMs: 20,
    });
    assert.equal(result.completed, 3);
    assert.equal(reactHits, 3);
    assert.equal(hits.includes("/web/should-not.ts"), false);
    assert.equal(hits.includes("/missing-from-bundle.js"), false);
  } finally {
    server.close();
  }
});
