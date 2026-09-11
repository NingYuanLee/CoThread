import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const virtualPrefix = "/home/user/";

function sandboxBase() {
  return resolve(process.env.LOCAL_SANDBOX_ROOT || ".local/sandboxes");
}

function bashExecutable() {
  if (process.platform !== "win32") return "/bin/bash";
  const candidates = [
    process.env.GIT_BASH_PATH,
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("本机执行器需要 Git Bash，请安装 Git for Windows 或设置 GIT_BASH_PATH");
  return found;
}

function cleanEnvironment(extra = {}) {
  const allowed = ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOME", "LANG"];
  return Object.fromEntries([
    ...allowed.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []),
    ...Object.entries(extra).map(([key, value]) => [key, String(value)]),
  ]);
}

function validId(value) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("本机工作区标识无效");
  return value;
}

class LocalSandboxInstance {
  constructor(sandboxId) {
    this.sandboxId = validId(sandboxId);
    this.root = resolve(sandboxBase(), this.sandboxId);
    this.files = {
      makeDir: async (path) => mkdir(this.localPath(path), { recursive: true }),
      write: async (path, content) => {
        const target = this.localPath(path);
        await mkdir(resolve(target, ".."), { recursive: true });
        const value = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
        await writeFile(target, value);
      },
    };
    this.commands = { run: (command, options = {}) => this.run(command, options) };
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
    await mkdir(this.localPath(cwd), { recursive: true });
    const rewritten = String(command).replaceAll(virtualPrefix, `${this.commandPath(virtualPrefix)}/`);
    try {
      const result = await execute(bashExecutable(), ["-lc", rewritten], {
        cwd: this.localPath(cwd),
        env: cleanEnvironment(envs),
        timeout: Math.min(Math.max(Number(timeoutMs) || 120000, 1000), 900000),
        maxBuffer: 6 * 1024 * 1024,
        windowsHide: true,
      });
      return { exitCode: 0, stdout: result.stdout || "", stderr: result.stderr || "" };
    } catch (error) {
      return {
        exitCode: typeof error.code === "number" ? error.code : 1,
        stdout: String(error.stdout || ""),
        stderr: String(error.stderr || (error.killed ? "命令执行超时" : error.message || "")),
      };
    }
  }

  async setTimeout() {}

  async kill() {
    await rm(this.root, { recursive: true, force: true });
  }
}

export const LocalSandbox = {
  async create() {
    const instance = new LocalSandboxInstance(randomUUID());
    await mkdir(instance.root, { recursive: true });
    return instance;
  },
  async connect(sandboxId) {
    const instance = new LocalSandboxInstance(sandboxId);
    if (!existsSync(instance.root)) throw new Error("Local sandbox not found");
    return instance;
  },
};

export const localSandboxEnabled = () => process.env.LOCAL_SANDBOX_ENABLED === "true";
