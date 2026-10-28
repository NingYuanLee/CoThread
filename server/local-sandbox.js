import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { promisify } from "node:util";
import { assertExternalAdmitted } from "./executor-fence.js";

const execute = promisify(execFile);
const outputLimit = 6 * 1024 * 1024;
const outputLimitMessage = "输出超过上限";
const virtualPrefix = "/home/user/";
// Keep aliases in one process on the same lifecycle without retaining every
// sandbox ever opened. Commands and in-flight file operations retain their
// instance until completion; idle instances may be collected.
const instances = new Map();
const instanceKey = (root) => (process.platform === "win32" ? root.toLowerCase() : root);
const collectedInstances = new FinalizationRegistry(({ key, reference }) => {
  if (instances.get(key) === reference) instances.delete(key);
});

function rememberInstance(instance) {
  const key = instanceKey(instance.root);
  const existing = instances.get(key)?.deref();
  if (existing) return existing;
  const reference = new WeakRef(instance);
  instances.set(key, reference);
  collectedInstances.register(instance, { key, reference }, instance);
  return instance;
}

function forgetInstance(instance) {
  const key = instanceKey(instance.root);
  if (instances.get(key)?.deref() === instance) instances.delete(key);
  collectedInstances.unregister(instance);
}

function utf8Prefix(text, bytes) {
  const buffer = Buffer.from(text);
  if (buffer.length <= bytes) return text;
  // Keep complete characters only; flushing here would add a replacement
  // character that can exceed the remaining byte budget.
  return new StringDecoder("utf8").write(buffer.subarray(0, bytes));
}

function sandboxBase() {
  return resolve(".local/sandboxes");
}

function bashExecutable() {
  if (process.platform !== "win32") return "/bin/bash";
  const candidates = [
    process.env.GIT_BASH_PATH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found)
    throw new Error("本机执行器需要 Git Bash，请安装 Git for Windows 或设置 GIT_BASH_PATH");
  return found;
}

function cleanEnvironment(extra = {}) {
  const allowed = [
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "LANG",
  ];
  return Object.fromEntries([
    ...allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    ...Object.entries(extra).map(([key, value]) => [key, String(value)]),
  ]);
}

function validId(value) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("本机工作区标识无效");
  return value;
}

/**
 * 结束一个子进程。Git Bash 会派生子进程，Windows 上按进程树结束更稳；
 * POSIX 使用独立进程组；必须先结束整棵树，再让调用方回收目录。
 */
function toBashPath(filePath) {
  const normalized = resolve(filePath);
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(normalized);
  if (!match) return normalized.replaceAll("\\", "/");
  return `/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

// Git Bash 的后台作业在 Windows 上常常不是 bash.exe 的子进程，taskkill /T 杀不到。
// 同壳里的 trap 用的是 MSYS pid，可以。停文件让那个壳自己收作业，然后再强杀剩余进程。
async function requestShellStop(child) {
  if (!child?.stopFile || child.stopRequested) return;
  child.stopRequested = true;
  try {
    await writeFile(child.stopFile, "1");
  } catch {
    // 文件写不进去时仍走下面的进程树终止。
  }
  const started = Date.now();
  while (child.exitCode === null && child.signalCode === null && Date.now() - started < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await requestShellStop(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  // Windows 上 Git Bash 会派生子进程，先按进程树杀一次；
  // 无论哪条路都要再兜底强杀本进程，避免 taskkill 不可用时杀不掉。
  if (process.platform === "win32" && child.pid) {
    try {
      await execute("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 5000,
      });
    } catch {
      // 交给下面的兜底。
    }
  }
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // 进程组已经退出时仍尝试结束直接子进程。
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // 进程已经退出。
  }
}

class LocalSandboxInstance {
  constructor(sandboxId) {
    this.sandboxId = validId(sandboxId);
    this.root = resolve(sandboxBase(), this.sandboxId);
    // 正在运行的子进程。kill() 必须连它们一起收掉，否则「回收沙箱」只删了文件，
    // 命令还在后台跑——容器 provider 的 kill 语义不是这样的。
    this.children = new Set();
    this.preparations = new Set();
    this.killed = false;
    this.files = {
      makeDir: (path) => this.prepare(() => mkdir(this.localPath(path), { recursive: true })),
      write: (path, content) =>
        this.prepare(async () => {
          const target = this.localPath(path);
          await mkdir(resolve(target, ".."), { recursive: true });
          const value = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
          await writeFile(target, value);
        }),
    };
    this.commands = { run: (command, options = {}) => this.run(command, options) };
  }

  assertActive() {
    if (this.killed || !existsSync(this.root)) throw new Error("Local sandbox not found");
  }

  async prepare(operation) {
    this.assertActive();
    const pending = Promise.resolve().then(operation);
    this.preparations.add(pending);
    try {
      return await pending;
    } finally {
      this.preparations.delete(pending);
    }
  }

  localPath(value) {
    if (typeof value !== "string" || !value.startsWith(virtualPrefix))
      throw new Error("本机文件路径必须位于 /home/user 下");
    const target = resolve(this.root, value.slice(virtualPrefix.length).replaceAll("/", sep));
    if (target !== this.root && !target.startsWith(this.root + sep))
      throw new Error("文件路径越出本机工作区");
    return target;
  }

  virtualPath(value) {
    this.localPath(value);
    return value;
  }

  async readFile(value) {
    return readFile(this.localPath(value));
  }

  commandPath(value) {
    return this.localPath(value).replaceAll("\\", "/");
  }

  async run(command, { cwd = "/home/user/", timeoutMs = 120000, envs = {} } = {}) {
    await this.prepare(() => mkdir(this.localPath(cwd), { recursive: true }));
    // kill may begin while the directory operation is waiting. Never spawn
    // after retirement, even if that operation was admitted before it.
    this.assertActive();
    const fence = assertExternalAdmitted();
    const rewritten = String(command).replaceAll(
      virtualPrefix,
      `${this.commandPath(virtualPrefix)}/`,
    );
    // Git Bash 的 ps 不支持 --ppid，pkill 也不在 PATH。set -m 后 jobs -p 能看到后台作业。
    // Windows 上强杀不会跑 trap，而且后台 sleep 的父进程常常不是这只 bash。
    // 停文件由同一只壳里的循环转成 SIGTERM，trap 再用 MSYS pid 收作业。
    // 前台命令会让 bash 把 INT/TERM 的 trap 推迟到该命令结束之后，停文件因此打断不了
    // 正在执行的命令（只能等它跑完，或等 taskkill，而 taskkill /T 打不到 MSYS 派生的
    // 前台子进程）。改成后台作业 + wait：wait 被信号打断时 trap 立即执行，再按进程组
    // kill -9 收掉命令整棵树，kill 才能像容器 provider 那样真正停下命令。
    const stopFile = `${this.root}${sep}.command-stop-${randomUUID()}`;
    const stopBash = toBashPath(stopFile).replaceAll("'", "");
    // 组语法要求至少一条命令，空命令用 : 占位，避免 { } 语法错误。
    const commandBody = rewritten.trim() ? rewritten : ":";
    const wrapped =
      process.platform === "win32"
        ? [
            "set -m",
            'trap \'_cothread_jobs=$(jobs -p); if [ -n "$_cothread_jobs" ]; then for _cothread_job in $_cothread_jobs; do kill -9 -- "-$_cothread_job" >/dev/null 2>&1 || kill -9 "$_cothread_job" >/dev/null 2>&1 || true; done; fi; if [ -n "$_cothread_watch" ]; then kill -9 "$_cothread_watch" >/dev/null 2>&1 || true; fi\' EXIT INT TERM',
            "_cothread_shell=$$",
            `(while true; do if [ -f '${stopBash}' ]; then kill -TERM $_cothread_shell >/dev/null 2>&1 || true; exit 0; fi; sleep 0.2; done) >/dev/null 2>&1 &`,
            "_cothread_watch=$!",
            "disown $_cothread_watch >/dev/null 2>&1 || true",
            "{",
            commandBody,
            "} &",
            "_cothread_command=$!",
            'wait "$_cothread_command"',
            "_cothread_status=$?",
            // 命令返回后仍可能有它启动的后台作业，和原来的 EXIT trap 一样按组收掉，
            // 不能让它们在命令结束后继续跑。
            'kill -9 -- "-$_cothread_command" >/dev/null 2>&1 || true',
            'exit "$_cothread_status"',
          ].join("\n")
        : "set -m; trap 'kill -9 $(jobs -p) >/dev/null 2>&1 || true' EXIT; " + rewritten;
    let child;
    try {
      child = spawn(bashExecutable(), ["-lc", wrapped], {
        cwd: this.localPath(cwd),
        env: cleanEnvironment(envs),
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return { exitCode: 1, stdout: "", stderr: String(error.message || error) };
    }
    if (process.platform === "win32") child.stopFile = stopFile;
    this.children.add(child);
    return new Promise((settle) => {
      const streams = {
        stdout: { text: "", bytes: 0, decoder: new StringDecoder("utf8") },
        stderr: { text: "", bytes: 0, decoder: new StringDecoder("utf8") },
      };
      let done = false;
      let outcome = null;
      let timedOut = false;
      let overflowed = false;
      let sealed = false;
      let termination;
      const stop = () => {
        sealed = true;
        return (termination ||= terminate(child));
      };
      const append = (name, text) => {
        const stream = streams[name];
        const bytes = Buffer.byteLength(text);
        const room = outputLimit - stream.bytes;
        if (bytes > room) {
          const prefix = utf8Prefix(text, room);
          stream.text += prefix;
          stream.bytes += Buffer.byteLength(prefix);
          overflowed = true;
          sealed = true;
          const stderr = streams.stderr;
          const note = `\n${outputLimitMessage}`;
          stderr.text = utf8Prefix(stderr.text, outputLimit - Buffer.byteLength(note)) + note;
          stderr.bytes = Buffer.byteLength(stderr.text);
          void stop();
          return;
        }
        stream.bytes += bytes;
        stream.text += text;
      };
      const take = (name, chunk) => {
        if (sealed || done) return;
        append(name, streams[name].decoder.write(chunk));
      };
      const deadline = setTimeout(
        () => {
          timedOut = true;
          void stop();
        },
        Math.min(Math.max(Number(timeoutMs) || 120000, 1000), 900000),
      );
      const finish = async () => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        if (!sealed) {
          append("stdout", streams.stdout.decoder.end());
          if (!overflowed) append("stderr", streams.stderr.decoder.end());
        }
        sealed = true;
        await termination;
        this.children.delete(child);
        const flushedOut = streams.stdout.text;
        const flushedErr = streams.stderr.text;
        const { code, signal } = outcome || {};
        settle({
          exitCode: overflowed || timedOut ? 1 : typeof code === "number" ? code : 1,
          stdout: flushedOut,
          stderr:
            flushedErr ||
            (overflowed
              ? outputLimitMessage
              : timedOut
                ? "命令执行超时"
                : signal
                  ? `命令被终止（${signal}）`
                  : ""),
        });
      };
      child.stdout?.on("data", (chunk) => take("stdout", chunk));
      child.stderr?.on("data", (chunk) => take("stderr", chunk));
      child.on("error", (error) => {
        if (!sealed && !streams.stderr.text) append("stderr", String(error.message || error));
        outcome = { code: 1 };
        finish();
      });
      child.on("exit", (code, signal) => {
        // 被终止时，孙进程可能仍握着继承来的 stdio 管道，close 迟迟不来；
        // 进程既已退出，收一小段输出后就结算，避免调用方白等整条命令。
        outcome = { code, signal };
        const timer = setTimeout(finish, 250);
        timer.unref?.();
      });
      child.on("close", (code, signal) => {
        outcome = { code, signal };
        finish();
      });
      if (fence?.signal) {
        const onAbort = () => {
          void stop();
        };
        if (fence.signal.aborted) void stop();
        else fence.signal.addEventListener("abort", onAbort, { once: true });
      }
      // kill() 可能在命令启动前就已经发生，这里补一次。
      if (this.killed) void stop();
    });
  }

  async setTimeout() {
    this.assertActive();
  }

  kill() {
    if (this.killPromise) return this.killPromise;
    this.killed = true;
    const children = [...this.children];
    this.killPromise = (async () => {
      // New filesystem work is closed synchronously. Finish already admitted
      // operations before removal, so late mkdir/write cannot resurrect it.
      await Promise.all([
        Promise.allSettled([...this.preparations]),
        Promise.all(children.map((child) => terminate(child))),
      ]);
      await Promise.all(children.map((child) => this.childExited(child)));
      await rm(this.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      this.children.clear();
      forgetInstance(this);
    })().catch((error) => {
      // A failed removal is retryable, but the old handle stays retired.
      this.killPromise = undefined;
      throw error;
    });
    return this.killPromise;
  }

  childExited(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      child.once("close", done);
      child.once("exit", done);
      const timer = setTimeout(done, 5000);
      timer.unref?.();
    });
  }
}

export const LocalSandbox = {
  async create() {
    const instance = new LocalSandboxInstance(randomUUID());
    await mkdir(instance.root, { recursive: true });
    const active = rememberInstance(instance);
    active.assertActive();
    return active;
  },
  async connect(sandboxId) {
    const instance = new LocalSandboxInstance(sandboxId);
    if (!existsSync(instance.root)) throw new Error("Local sandbox not found");
    const existing = instances.get(instanceKey(instance.root))?.deref();
    return existing || rememberInstance(instance);
  },
};
