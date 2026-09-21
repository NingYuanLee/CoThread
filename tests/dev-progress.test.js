import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  COTHREAD_BANNER,
  COTHREAD_GREETING,
  formatDevLogLine,
  highlightDevLogBody,
  inferDevLogKind,
  renderDevBanner,
  stripAnsi,
  writeDevBanner,
} from "../scripts/dev-log.js";
import {
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
  const body = "共序开发已就绪：http://127.0.0.1:3100  10%  [██░]  admin@cothread.local  .local/mysql-data";
  const painted = highlightDevLogBody(body, { color: true });
  assert.equal(stripAnsi(painted), body);
  assert.match(painted, /\u001b\[4m/);
  assert.match(painted, /http:\/\/127\.0\.0\.1:3100/);
  assert.match(painted, /admin@cothread\.local/);
  assert.equal(highlightDevLogBody(body, { color: false }), body);
});

test("startup lines are classified by kind", () => {
  assert.equal(inferDevLogKind(COTHREAD_GREETING), "hello");
  assert.equal(inferDevLogKind("MySQL 已运行于 127.0.0.1:3307"), "check");
  assert.equal(inferDevLogKind("正在确认本机便携版 MySQL（127.0.0.1:3307）…"), "check");
  assert.equal(inferDevLogKind("Vite 已启动：http://127.0.0.1:3102"), "start");
  assert.equal(inferDevLogKind("共序接口已启动：http://127.0.0.1:3101"), "start");
  assert.equal(inferDevLogKind("已有超级管理员 admin@cothread.local，账号密码未改动。"), "log");
  assert.equal(inferDevLogKind("共序开发已就绪：http://127.0.0.1:3100"), "ready");
  assert.equal(inferDevLogKind("前端预热失败（可忽略，首屏可能稍慢）"), "warn");
  assert.equal(inferDevLogKind("API 进程已退出。"), "error");
  assert.equal(
    formatDevLogLine("已有超级管理员 admin@cothread.local", { now: clock() }),
    "18:22:01 [Cothread] [日志]  已有超级管理员 admin@cothread.local",
  );
});

test("startup banner spells Cothread and greets", () => {
  const chunks = [];
  const stream = { isTTY: false, write(text) { chunks.push(text); } };
  writeDevBanner(stream, { color: false, now: clock() });
  const output = chunks.join("");
  assert.ok(COTHREAD_BANNER.every((line) => output.includes(line)));
  assert.match(output, /Cothread|____\/___/);
  assert.equal(chunks.at(-1), `18:22:01 [Cothread] [招呼]  ${COTHREAD_GREETING}\n`);
  assert.match(renderDevBanner({ color: true }), /\u001b\[38;2;183;210;149m/);
});

test("progress bar stays below 100 until finish", () => {
  const chunks = [];
  const stream = { isTTY: false, write(text) { chunks.push(text); } };
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
  const stream = { isTTY: true, write(text) { chunks.push(text); } };
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
  const stream = { isTTY: false, write(text) { chunks.push(text); } };
  const progress = createDevProgress({ stream, tty: false, clock, color: false, banner: true });
  progress.note("MySQL 已运行于 127.0.0.1:3307");
  assert.ok(chunks[0].includes(COTHREAD_BANNER[0]));
  assert.equal(chunks.at(-2), "18:22:01 [Cothread] [检查]  MySQL 已运行于 127.0.0.1:3307\n");
});

test("tty notes commit the progress bar before the next entry", () => {
  const chunks = [];
  const stream = { isTTY: true, write(text) { chunks.push(text); } };
  const progress = createDevProgress({ stream, tty: true, clock, color: false, animate: false });
  progress.set(10, "确认数据库");
  progress.note("MySQL 已运行于 127.0.0.1:3307，数据位于项目 .local/mysql-data。");
  assert.match(
    chunks.join(""),
    /确认数据库\n18:22:01 \[Cothread\] \[检查\]  MySQL 已运行于 127\.0\.0\.1:3307，数据位于项目 \.local\/mysql-data。\n/,
  );
});

test("warmup url extraction follows browser module refs only", () => {
  assert.equal(normalizeWarmupUrl("/web/main.tsx?t=1"), "/web/main.tsx");
  assert.equal(normalizeWarmupUrl("https://cdn.example/x.js"), null);
  assert.equal(normalizeWarmupUrl("/api/health"), null);
  assert.deepEqual(
    extractWarmupUrls(`
      <link rel="modulepreload" href="/web/main.tsx"/>
      <script type="module" src="/web/App.tsx"></script>
      import "/@vite/client";
      import { App } from "/web/App.tsx";
      import("./WorkspaceApp.tsx");
      from "https://esm.sh/react";
    `, "/web/main.tsx"),
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
