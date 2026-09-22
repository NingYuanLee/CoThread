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
const HIGHLIGHT_PATTERN = /(https?:\/\/[^\s]+)|(\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b)|([\w.+-]+@[\w.-]+\.[A-Za-z][A-Za-z0-9-]*)|(:\d{2,5}\b)|(\b\d{1,3}%)|([█▓▒]+)|(░+)|(共序)|(已就绪|已启动|浏览器可打开)|(\.local(?:\/[\w.-]+)*)/g;

export function stripAnsi(text) {
  return String(text || "").replace(ANSI_PATTERN, "");
}

export function visibleWidth(text) {
  return stripAnsi(text).length;
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
  if (/可忽略|未找到 Git Bash|警告/.test(line)) return "warn";
  if (/失败|已退出|未能启动|Error:|\bE[A-Z]{3,}\b|超时/.test(line)) return "error";
  if (
    /正在确认|已运行于|DATABASE_URL|停止旧进程|释放端口|等待接口|等待 Vite|等待网关|核对接口|需要 Node|\.env|已停止/.test(line)
  ) {
    return "check";
  }
  if (
    /已启动|正在启动|启动 API|启动开发网关|编译 |正在预热|已预热|数据库：|执行器：|本地数据库和专用账号/.test(line)
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
  return String(body).replace(HIGHLIGHT_PATTERN, (token, url, host, email, port, percent, filled, empty) => {
    if (url || host) return `${BOLD}${UNDERLINE}${READY}${token}${RESET}`;
    if (email || port || percent) return `${BOLD}${ART}${token}${RESET}`;
    if (filled) return `${ART}${token}${RESET}`;
    if (empty) return `${DIM}${token}${RESET}`;
    return `${BOLD}${ART}${token}${RESET}`;
  });
}

export function isDevLogContinuation(text) {
  const line = String(text ?? "");
  if (/^\s/.test(line)) return true;
  if (/^[\]})]+[,;]?$/.test(line.trim())) return true;
  return false;
}

export function updateDevLogBlockDepth(depth, text) {
  let next = Math.max(0, Number(depth) || 0);
  for (const ch of String(text ?? "")) {
    if (ch === "{" || ch === "[") next += 1;
    else if (ch === "}" || ch === "]") next = Math.max(0, next - 1);
  }
  return next;
}

function splitDevLogBodies(text) {
  const raw = String(text ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
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

export function formatDevLogContinuation(text, {
  color = false,
} = {}) {
  return highlightDevLogBody(String(text ?? ""), { color });
}

export function formatDevLogLine(text, {
  color = false,
  now = new Date(),
  level = "info",
  kind,
} = {}) {
  const bodies = splitDevLogBodies(text);
  const head = bodies[0] ?? "";
  const { prefix } = formatDevLogPrefix({ color, now, level, kind, text: head });
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

export function writeDevBanner(stream = process.stdout, {
  color = shouldColorDevLog({ stream }),
  greeting = COTHREAD_GREETING,
  now = new Date(),
} = {}) {
  const banner = renderDevBanner({ color });
  stream.write(`\n${banner}\n\n`);
  stream.write(`${formatDevLogLine(greeting, { color, now, kind: "hello" })}\n`);
}
