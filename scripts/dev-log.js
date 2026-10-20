const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const UNDERLINE = "\x1b[4m";
const ART = "\x1b[38;2;183;210;149m";
const READY = "\x1b[38;2;157;214;130m";

export const COTHREAD_BANNER = [
  "   ______      __  __                        __",
  "  / ____/___  / /_/ /_  ________  ____ _____/ /",
  " / /   / __ \\/ __/ __ \\/ ___/ _ \\/ __ `/ __  / ",
  "/ /___/ /_/ / /_/ / / / /  /  __/ /_/ / /_/ /  ",
  "\\____/\\____/\\__/_/ /_/_/   \\___/\\__,_/\\__,_/   ",
];

export const COTHREAD_GREETING = "你好，欢迎使用共序。正在启动本地开发环境…";

export const DEV_LOG_KINDS = {
  hello: { id: "hello", label: "招呼", color: "\x1b[38;2;183;210;149m" },
  check: { id: "check", label: "检查", color: "\x1b[38;2;110;196;214m" },
  start: { id: "start", label: "启动", color: "\x1b[38;2;126;197;120m" },
  progress: { id: "progress", label: "进度", color: "\x1b[38;2;212;184;122m" },
  log: { id: "log", label: "日志", color: "\x1b[38;2;148;158;145m" },
  ready: { id: "ready", label: "就绪", color: "\x1b[38;2;157;214;130m" },
  warn: { id: "warn", label: "警告", color: "\x1b[33m" },
  error: { id: "error", label: "错误", color: "\x1b[31m" },
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const HIGHLIGHT_PATTERN =
  /(https?:\/\/[^\s]+)|(\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b)|([\w.+-]+@[\w.-]+\.[A-Za-z][A-Za-z0-9-]*)|(:\d{2,5}\b)|(\b\d{1,3}%)|([█▓▒]+)|(░+)|(共序)|(已就绪|已启动|浏览器可打开)|(\.local(?:\/[\w.-]+)*)|(?:(?<=密码：)|^)([A-Za-z0-9]{16})$/g;

export function stripAnsi(text) {
  return String(text || "").replace(ANSI_PATTERN, "");
}

function charWidth(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

export function visibleWidth(text) {
  let width = 0;
  for (const ch of stripAnsi(text)) width += charWidth(ch);
  return width;
}

const WRAP_ATOM =
  /(?:https?:\/\/\S+|(?:[A-Za-z]:[\\/]|file:\/\/)\S+|checksum=[0-9a-fA-F]{8,}|[0-9a-fA-F]{32,}|\s+|[，。：；、]|[^\s，。：；、]+)/gu;

function hardSplitPlain(atom, width) {
  const parts = [];
  let rest = String(atom ?? "");
  const limit = Math.max(8, width);
  while (rest) {
    if (visibleWidth(rest) <= limit) {
      parts.push(rest);
      break;
    }
    let take = "";
    for (const ch of rest) {
      if (visibleWidth(take + ch) > limit) break;
      take += ch;
    }
    if (!take) take = [...rest][0];
    parts.push(take);
    rest = rest.slice(take.length);
  }
  return parts;
}

/**
 * Wrap one plain line so a terminal of `firstWidth` / `nextWidth` columns does not
 * break checksums, URLs, or paths in the middle. A token wider than every line is split.
 */
export function wrapPlainText(text, firstWidth, nextWidth = firstWidth) {
  const plain = String(text ?? "");
  const maxFirst = Math.max(8, Number(firstWidth) || 8);
  const maxNext = Math.max(8, Number(nextWidth) || maxFirst);
  if (visibleWidth(plain) <= maxFirst) return [plain];
  const atoms = plain.match(WRAP_ATOM) ?? [plain];
  const lines = [];
  let current = "";
  const room = () => (lines.length === 0 ? maxFirst : maxNext);

  function breakLine() {
    if (!current) return;
    lines.push(current.trimEnd());
    current = "";
  }

  for (const atom of atoms) {
    if (/^\s+$/.test(atom)) {
      if (current && visibleWidth(current + atom) <= room()) current += atom;
      continue;
    }
    if (current && visibleWidth(current + atom) <= room()) {
      current += atom;
      continue;
    }
    if (current) breakLine();
    if (visibleWidth(atom) <= room()) {
      current = atom;
      continue;
    }
    if (lines.length === 0 && visibleWidth(atom) <= maxNext) {
      lines.push("");
      current = atom;
      continue;
    }
    const pieces = hardSplitPlain(atom, room());
    lines.push(...pieces.slice(0, -1));
    current = pieces.at(-1) ?? "";
  }
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [plain];
}

export function fitDevLogContinuation(text, columns) {
  const width = Number(columns) || 0;
  const body = String(text ?? "");
  if (width < 20 || visibleWidth(body) < width) return body;
  return wrapPlainText(body, width - 1, width - 1).join("\n");
}

export function shouldColorDevLog({
  stream = process.stdout,
  tty = stream?.isTTY,
  env = process.env,
} = {}) {
  if (env?.NO_COLOR) return false;
  if (env?.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
  return Boolean(tty);
}

export function formatDevTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function resolveDevLogKind(kind, text = "", level = "info") {
  if (kind && DEV_LOG_KINDS[kind]) return kind;
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  return inferDevLogKind(text);
}

export function inferDevLogKind(text) {
  const line = String(text || "");
  if (/^\[[█▓▒░▄▅▃▂━─][^\]]*\]\s+\d+%/.test(line)) return "progress";
  if (/欢迎使用共序/.test(line)) return "hello";
  if (/已就绪|浏览器可打开|已打开浏览器/.test(line)) return "ready";
  if (/可忽略|未找到 Git Bash|警告|\bskipped\b|\bunavailable\b/i.test(line)) return "warn";
  if (
    /失败|已退出|未能启动|Error:|\bE[A-Z]{3,}\b|超时|\bfailed\b|\bcrashed\b|\bcorrupt\b/i.test(line)
  )
    return "error";
  if (
    /正在确认|正在检查|已运行于|DATABASE_URL|开发数据库目标|停止旧进程|释放端口|未发现需要停止的旧进程|发现旧进程|已有超级管理员|初始超级管理员已创建|跳过初始超级管理员|重置密码|初始密码|^[A-Za-z0-9]{16}$|等待接口|等待 Server|等待 Vite|等待网关|核对接口|核对 Server|核对网关|需要 Node|\.env|已停止/.test(
      line,
    )
  ) {
    return "check";
  }
  if (
    /已启动|正在启动|启动 API|启动 Server|启动开发网关|编译 |预热|正在预热|已预热|数据库：|执行器：|本地数据库和专用账号/.test(
      line,
    )
  ) {
    return "start";
  }
  return "log";
}

function paintTag(label, { color, tone }) {
  const wrapped = `[${label}]`;
  return color ? `${BOLD}${tone}${wrapped}${RESET}` : wrapped;
}

export function highlightDevLogBody(body, { color = false } = {}) {
  if (!color || !body) return body;
  return String(body).replace(
    HIGHLIGHT_PATTERN,
    (
      token,
      url,
      host,
      email,
      port,
      percent,
      filled,
      empty,
      _brand,
      _status,
      _localPath,
      password,
    ) => {
      if (password) return `${BOLD}\x1b[33m${token}${RESET}`;
      if (url || host) return `${BOLD}${UNDERLINE}${READY}${token}${RESET}`;
      if (email || port || percent) return `${BOLD}${ART}${token}${RESET}`;
      if (filled) return `${ART}${token}${RESET}`;
      if (empty) return `${DIM}${token}${RESET}`;
      return `${BOLD}${ART}${token}${RESET}`;
    },
  );
}

export function isDevLogContinuation(text) {
  const line = String(text ?? "");
  if (/^\s/.test(line)) return true;
  if (/^[\]})]+[,;]?$/.test(line.trim())) return true;
  return false;
}

export function updateDevLogBlockDepth(depth, text) {
  let next = Math.max(0, Number(depth) || 0);
  // CSI color codes contain "[" but never a matching "]". Count only visible text.
  for (const ch of stripAnsi(text)) {
    if (ch === "{" || ch === "[") next += 1;
    else if (ch === "}" || ch === "]") next = Math.max(0, next - 1);
  }
  return next;
}

/** Vite's own logger already prints a timestamp and [vite]. Don't wrap it again. */
export function isViteDevLog(text) {
  const line = stripAnsi(text).trim();
  return /^(?:上午|下午)?\s*\d{1,2}:\d{2}:\d{2}(?:\s*[ap]m)?\s+\[vite\](?!\w)/i.test(line);
}

const ERROR_HEAD_RE =
  /^(?:Uncaught\s+)?(?:[\w$.]+\.)?(?:\w*Error|\w*Exception)(?:\s*\[[A-Za-z0-9_]+])?\s*:/;

export function isDevErrorHead(line) {
  const text = String(line ?? "").trim();
  if (!text) return false;
  if (text.startsWith("[未捕获异常]") || text.startsWith("[未处理的 Promise 拒绝]")) return true;
  return ERROR_HEAD_RE.test(text);
}

export function isDevStackFrame(line) {
  return /^\s+at\s+\S/.test(String(line ?? ""));
}

export function isDevErrorCaret(line) {
  return /^\s*\^+\s*$/.test(String(line ?? ""));
}

export function isDevNodeLocation(line) {
  const text = String(line ?? "").trim();
  if (!text || /\s/.test(text)) return false;
  return /^(?:[A-Za-z]:[\\/]|file:\/\/|node:|\/).+:\d+(?::\d+)?$/.test(text);
}

export function isDevNodeVersion(line) {
  return /^Node\.js v\d+\.\d+\.\d+/.test(String(line ?? "").trim());
}

function devErrorRecord(text, continuation) {
  return { role: "error", text: String(text ?? ""), continuation: Boolean(continuation) };
}

function devErrorContinues(line, state) {
  if (isDevStackFrame(line) || isDevErrorCaret(line) || isDevErrorHead(line)) return true;
  if (isDevNodeVersion(line) && (state.sawFrame || state.sawHead || state.sawCaret)) return true;
  if (state.depth > 0) return true;
  if (/^\s/.test(line) && line.trim()) return true;
  if (/^[\]})]+[,;]?$/.test(line.trim())) return true;
  if (state.sawHead && !state.sawFrame && state.depth === 0) {
    const kind = inferDevLogKind(line);
    if (
      kind === "hello" ||
      kind === "check" ||
      kind === "start" ||
      kind === "ready" ||
      kind === "progress"
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Split one child stream into normal logs and Node error blocks.
 * Error records keep source context, stack frames, and inspect properties verbatim.
 * A block stays open across chunks until a non-error line, settle(), or finish().
 */
export function createDevOutputParser() {
  let mode = "normal";
  let heldLocation = null;
  let heldBlank = false;
  let depth = 0;
  let blockDepth = 0;
  let sawFrame = false;
  let sawCaret = false;
  let sawHead = false;
  let closed = false;

  function closeError() {
    mode = "normal";
    depth = 0;
    sawFrame = false;
    sawCaret = false;
    sawHead = false;
    heldBlank = false;
    blockDepth = 0;
  }

  function asNormal(line) {
    if (!String(line).trim() && blockDepth === 0) return [];
    if (blockDepth === 0 && isViteDevLog(line)) {
      return [{ role: "log", text: line, continuation: false, passthrough: true, blockDepth: 0 }];
    }
    const continuation = blockDepth > 0 || isDevLogContinuation(line);
    blockDepth = updateDevLogBlockDepth(blockDepth, line);
    return [{ role: "log", text: line, continuation, blockDepth }];
  }

  function appendError(line, first = false) {
    if (isDevStackFrame(line)) sawFrame = true;
    if (isDevErrorCaret(line)) sawCaret = true;
    if (isDevErrorHead(line)) sawHead = true;
    depth = updateDevLogBlockDepth(depth, line);
    return [devErrorRecord(line, !first)];
  }

  function openError(line) {
    mode = "error";
    depth = 0;
    sawFrame = false;
    sawCaret = false;
    sawHead = false;
    heldBlank = false;
    blockDepth = 0;
    return appendError(line, true);
  }

  function endAndReprocess(line) {
    closeError();
    return push(line);
  }

  function takeError(line) {
    if (!line.trim() && depth > 0) return appendError(line);
    if (!line.trim()) {
      const blankMatters = (sawCaret && !sawHead) || sawFrame || sawHead;
      if (!blankMatters) return endAndReprocess(line);
      if (heldBlank) {
        heldBlank = false;
        return endAndReprocess(line);
      }
      heldBlank = true;
      return [];
    }
    if (heldBlank) {
      if (!devErrorContinues(line, { sawFrame, sawHead, sawCaret, depth })) {
        heldBlank = false;
        return endAndReprocess(line);
      }
      heldBlank = false;
      return [devErrorRecord("", true), ...appendError(line)];
    }
    if (!devErrorContinues(line, { sawFrame, sawHead, sawCaret, depth }))
      return endAndReprocess(line);
    return appendError(line);
  }

  function takeLocation(line) {
    const location = heldLocation;
    heldLocation = null;
    mode = "normal";
    const confirms =
      /^\s+\S/.test(line) || isDevErrorCaret(line) || isDevErrorHead(line) || isDevStackFrame(line);
    if (!confirms) return [...asNormal(location), ...push(line)];
    return [...openError(location), ...takeError(line)];
  }

  function push(line) {
    if (closed) return [];
    const text = String(line ?? "");
    if (mode === "maybeLocation") return takeLocation(text);
    if (mode === "error") return takeError(text);
    if (isDevNodeLocation(text)) {
      mode = "maybeLocation";
      heldLocation = text;
      return [];
    }
    if (isDevErrorHead(text) || isDevStackFrame(text) || isDevErrorCaret(text))
      return openError(text);
    return asNormal(text);
  }

  function flushHoldings() {
    const records = [];
    if (mode === "maybeLocation" && heldLocation != null) {
      records.push(...asNormal(heldLocation));
      heldLocation = null;
      mode = "normal";
    }
    if (mode === "error") {
      if (heldBlank) {
        records.push(devErrorRecord("", true));
        heldBlank = false;
      }
      closeError();
    }
    return records;
  }

  return {
    push,
    isHolding() {
      return mode === "error" || mode === "maybeLocation";
    },
    settle() {
      if (closed) return { wait: false, records: [] };
      if (mode === "maybeLocation") {
        const records = heldLocation == null ? [] : asNormal(heldLocation);
        heldLocation = null;
        mode = "normal";
        return { wait: false, records };
      }
      if (mode !== "error") return { wait: false, records: [] };
      if (depth > 0 || (heldBlank && sawCaret && !sawHead)) return { wait: true, records: [] };
      const records = [];
      if (heldBlank) {
        records.push(devErrorRecord("", true));
        heldBlank = false;
      }
      closeError();
      return { wait: false, records };
    },
    forceClose() {
      if (closed) return [];
      return flushHoldings();
    },
    finish() {
      if (closed) return [];
      closed = true;
      return flushHoldings();
    },
  };
}

function splitDevLogBodies(text) {
  const raw = String(text ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const lines = raw.split("\n");
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  if (lines.length <= 1) {
    return [String(lines[0] ?? "").trim()];
  }
  return lines.map((line, index) => (index === 0 ? line.trimEnd() : line));
}

function formatDevLogPrefix({
  color = false,
  now = new Date(),
  level = "info",
  kind,
  text = "",
} = {}) {
  const resolved = resolveDevLogKind(kind, text, level);
  const meta = DEV_LOG_KINDS[resolved] || DEV_LOG_KINDS.log;
  const time = formatDevTime(now);
  const stamp = color ? `${DIM}${time}${RESET}` : time;
  const brand = paintTag("Cothread", { color, tone: ART });
  const kindTag = paintTag(meta.label, { color, tone: meta.color });
  return {
    prefix: `${stamp} ${brand} ${kindTag}`,
    resolved,
  };
}

export function formatDevLogContinuation(text, { color = false } = {}) {
  return highlightDevLogBody(String(text ?? ""), { color });
}

export function formatDevLogLine(
  text,
  { color = false, now = new Date(), level = "info", kind, columns } = {},
) {
  const bodies = splitDevLogBodies(text);
  const head = bodies[0] ?? "";
  const { prefix } = formatDevLogPrefix({ color, now, level, kind, text: head });
  const width = Number(columns) || 0;
  if (width >= 20 && bodies.length <= 1 && head && !/[{[]\s*$/.test(head)) {
    const gap = "  ";
    const budget = width - 1;
    const firstWidth = budget - visibleWidth(prefix) - visibleWidth(gap);
    const nextWidth = budget - 2;
    if (firstWidth >= 8 && visibleWidth(head) > firstWidth) {
      const [first, ...rest] = wrapPlainText(head, firstWidth, nextWidth);
      const lines = [first ? `${prefix}${gap}${highlightDevLogBody(first, { color })}` : prefix];
      for (const part of rest) {
        if (!part) continue;
        lines.push(highlightDevLogBody(`  ${part}`, { color }));
      }
      return lines.join("\n");
    }
  }
  const paintedBodies = bodies.map((line) => highlightDevLogBody(line, { color }));
  if (bodies.length <= 1) {
    const painted = paintedBodies[0] ?? "";
    if (!painted) return prefix;
    // Object/array dumps: put the body on the next line so continuations stay flush left.
    if (/[{[]\s*$/.test(stripAnsi(painted))) return `${prefix}\n${painted}`;
    return `${prefix}  ${painted}`;
  }
  return [prefix, ...paintedBodies].join("\n");
}

export function renderDevBanner({ color = false } = {}) {
  const lines = color
    ? COTHREAD_BANNER.map((line) => `${BOLD}${ART}${line}${RESET}`)
    : [...COTHREAD_BANNER];
  return lines.join("\n");
}

export function writeDevBanner(
  stream = process.stdout,
  { color = shouldColorDevLog({ stream }), greeting = COTHREAD_GREETING, now = new Date() } = {},
) {
  const banner = renderDevBanner({ color });
  stream.write(`\n${banner}\n\n`);
  stream.write(`${formatDevLogLine(greeting, { color, now, kind: "hello" })}\n`);
}
