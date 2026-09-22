import http from "node:http";
import { formatDevLogLine, inferDevLogKind, shouldColorDevLog, visibleWidth, writeDevBanner } from "./dev-log.js";
import { sleep } from "./dev-runtime.js";

const BAR_WIDTH = 28;
const FILL_CHAR = "█";
const EMPTY_CHAR = "░";
const HEAD_FRAMES = ["▓", "▒", "▓", "█"];
const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export function renderDevSpinner(frame = 0) {
  return SPINNER[Math.abs(Number(frame) || 0) % SPINNER.length];
}

export function renderDevProgressBar(percent, { frame = 0, animated = false } = {}) {
  const clamped = Math.max(0, Math.min(100, Math.floor(Number(percent) || 0)));
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  const cells = Array.from({ length: BAR_WIDTH }, (_, index) => (index < filled ? FILL_CHAR : EMPTY_CHAR));
  if (animated && clamped < 100) {
    const head = Math.min(BAR_WIDTH - 1, filled);
    cells[head] = HEAD_FRAMES[Math.abs(Number(frame) || 0) % HEAD_FRAMES.length];
    const emptySpan = BAR_WIDTH - head;
    if (emptySpan > 1) {
      const pulseAt = head + 1 + (Math.abs(Number(frame) || 0) % (emptySpan - 1));
      cells[pulseAt] = frame % 2 === 0 ? "▒" : EMPTY_CHAR;
    }
  }
  return cells.join("");
}

export function renderDevProgress(percent, label = "", { frame = 0, animated = false } = {}) {
  const clamped = Math.max(0, Math.min(100, Math.floor(Number(percent) || 0)));
  const bar = renderDevProgressBar(clamped, { frame, animated });
  const text = String(label || "").replaceAll(/\s+/g, " ").trim();
  const spin = animated && clamped < 100 ? ` ${renderDevSpinner(frame)}` : "";
  return `[${bar}] ${String(clamped).padStart(3, " ")}%${spin}  ${text}`.trimEnd();
}

export function createDevProgress({
  stream = process.stdout,
  tty = stream?.isTTY,
  color = shouldColorDevLog({ stream, tty }),
  clock = () => new Date(),
  banner = false,
  animate = Boolean(tty),
  interval = setInterval,
  clearTimer = clearInterval,
  tickMs = 80,
} = {}) {
  let percent = 0;
  let label = "准备启动";
  let finished = false;
  let lastWidth = 0;
  let lastPlain = "";
  let frame = 0;
  let timer;

  function decorate(text, extra = {}) {
    return formatDevLogLine(text, { color, now: clock(), ...extra });
  }

  function writeStatus(line, { newline = true } = {}) {
    if (tty) {
      stream.write(`\r${line}${" ".repeat(Math.max(0, lastWidth - visibleWidth(line)))}`);
      lastWidth = visibleWidth(line);
      if (newline) {
        stream.write("\n");
        lastWidth = 0;
      }
      return;
    }
    stream.write(`${line}\n`);
  }

  function paint() {
    const line = decorate(renderDevProgress(percent, label, {
      frame,
      animated: animate && !finished && percent < 100,
    }), { kind: "progress" });
    if (!tty) {
      if (line === lastPlain) return;
      lastPlain = line;
    }
    writeStatus(line, { newline: !tty });
  }

  function stopMotion() {
    if (timer == null) return;
    clearTimer(timer);
    timer = undefined;
  }

  function startMotion() {
    if (!animate || finished || timer != null) return;
    timer = interval(() => {
      if (finished) {
        stopMotion();
        return;
      }
      frame += 1;
      paint();
    }, tickMs);
  }

  if (banner) writeDevBanner(stream, { color, now: clock() });

  return {
    set(nextPercent, nextLabel) {
      if (finished) return;
      const capped = Math.min(99, Math.max(percent, Number(nextPercent) || 0));
      percent = capped;
      if (nextLabel) label = nextLabel;
      paint();
      startMotion();
    },
    note(text, extra = {}) {
      const line = String(text || "").replaceAll(/\s+/g, " ").trim();
      if (!line) return;
      if (tty && lastWidth) {
        stream.write("\n");
        lastWidth = 0;
      }
      stream.write(`${decorate(line, { kind: extra.kind || inferDevLogKind(line), level: extra.level })}\n`);
      if (!finished) paint();
    },
    finish(readyLine) {
      if (finished) return;
      finished = true;
      stopMotion();
      percent = 100;
      label = "浏览器可打开";
      writeStatus(decorate(renderDevProgress(100, label), { kind: "progress" }), { newline: true });
      if (readyLine) stream.write(`${decorate(readyLine, { kind: "ready" })}\n`);
    },
    fail(message) {
      if (finished) return;
      finished = true;
      stopMotion();
      if (tty) stream.write("\n");
      stream.write(`${decorate(message, { kind: "error", level: "error" })}\n`);
    },
  };
}

export function normalizeWarmupUrl(raw) {
  if (!raw) return null;
  let url = String(raw).trim();
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
      url = `${parsed.pathname}${parsed.search}`;
    } catch {
      return null;
    }
  }
  if (!url.startsWith("/")) return null;
  const path = url.split("?")[0];
  if (path.startsWith("/api") || path === "/mcp" || path.startsWith("/mcp/")) return null;
  if (path.endsWith(".map") || path === "/favicon.ico") return null;
  return path;
}

const WARMUP_REF = /(?:from|import)\(\s*["']([^"']+)["']|[^\w]from\s+["']([^"']+)["']|[^\w]import\s+["']([^"']+)["']|\b(?:href|src)=["']([^"']+)["']/g;

export function resolveWarmupUrl(raw, fromPath = "/") {
  const absolute = normalizeWarmupUrl(raw);
  if (absolute) return absolute;
  const ref = String(raw || "").trim();
  if (!ref.startsWith(".")) return null;
  const directory = fromPath.endsWith("/")
    ? fromPath
    : `${fromPath.split("/").slice(0, -1).join("/")}/`;
  try {
    return normalizeWarmupUrl(new URL(ref, `http://127.0.0.1${directory}`).pathname);
  } catch {
    return null;
  }
}

export function extractWarmupUrls(source, fromPath = "/") {
  const urls = [];
  const seen = new Set();
  const text = String(source || "");
  for (const match of text.matchAll(WARMUP_REF)) {
    const url = resolveWarmupUrl(match[1] || match[2] || match[3] || match[4], fromPath);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function fetchDevUrlOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {
      timeout: timeoutMs,
      family: 4,
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 400) {
          resolve(Buffer.concat(chunks).toString("utf8"));
          return;
        }
        if (response.statusCode === 404) {
          resolve("");
          return;
        }
        const error = new Error(`${url} -> ${response.statusCode}`);
        error.statusCode = response.statusCode;
        reject(error);
      });
    });
    request.on("timeout", () => request.destroy(new Error(`${url} 探测超时`)));
    request.on("error", reject);
  });
}

function isRetryableWarmupError(error) {
  if (["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED"].includes(error.code)) return true;
  return error.statusCode === 502 || error.statusCode === 503 || /探测超时$/.test(error.message || "");
}

async function fetchDevUrl(url, { timeoutMs = 60000, retryDelayMs = 200 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await fetchDevUrlOnce(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryableWarmupError(error) || attempt === 7) throw error;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function isBinaryWarmupPath(path) {
  return /\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot)$/i.test(path);
}

export function shouldFollowWarmup(path) {
  if (!path || isBinaryWarmupPath(path)) return false;
  return !path.startsWith("/node_modules/.vite/deps/");
}

export function warmupCrawlPercent(completed) {
  return Math.min(99, 58 + Math.round(41 * (1 - Math.exp(-(Number(completed) || 0) / 28))));
}

export async function warmDevFrontend(origin, {
  onProgress,
  timeoutMs = 300000,
  concurrency = 3,
  retryDelayMs = 200,
} = {}) {
  const start = Date.now();
  const queue = ["/"];
  const seen = new Set(queue);
  let inflight = 0;
  let completed = 0;
  let lastError;

  while (queue.length || inflight) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`等待前端编译超时（已编译 ${completed} 个模块）`);
    }
    if (lastError) throw lastError;
    while (inflight < concurrency && queue.length) {
      const path = queue.shift();
      inflight += 1;
      fetchDevUrl(`${origin}${path}`, { retryDelayMs })
        .then((body) => {
          completed += 1;
          onProgress?.({ completed, queued: queue.length, inflight, path });
          if (!body || !shouldFollowWarmup(path)) return;
          for (const next of extractWarmupUrls(body, path)) {
            if (seen.has(next)) continue;
            seen.add(next);
            queue.push(next);
          }
        })
        .catch((error) => {
          lastError = error;
        })
        .finally(() => {
          inflight -= 1;
        });
    }
    await sleep(40);
  }
  if (lastError) throw lastError;
  return { completed, discovered: seen.size };
}

export function attachChildOutput(child, progress) {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += String(chunk).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) progress.note(line);
    });
  }
}
