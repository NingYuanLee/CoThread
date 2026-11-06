import { randomUUID, createHash, createPrivateKey } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v3";
import { query } from "./db.ts";
import type { Db } from "./types.ts";
import { HttpError } from "./service.ts";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import {
  injectMiniprogramRuntimeSource,
  resolveMiniprogramRuntime,
} from "./miniprogram-runtime-environment.ts";
import type { MiniprogramRuntimeConfig } from "./miniprogram-runtime-environment.ts";
import { miniprogramSnapshot } from "./miniprogram-workspace.ts";
import type { MiniprogramFile } from "./miniprogram-workspace.ts";

/**
 * WeChat release path (miniprogram-ci).
 *
 * Two hard rules:
 *  1. miniprogram-ci receives the upload key as a privateKey string. It is not
 *     written out as a .key file for the library to read back. The only on-disk
 *     copy is the short-lived runner request in a throwaway directory, mode
 *     0o600, deleted when the call ends.
 *  2. Nothing that reaches a log, an event row or a response may contain the
 *     key material, so every provider message passes through redactSecrets.
 *
 * Uploading creates a WeChat experience version. Review and production release
 * still happen in WeChat, so CoThread only requires project write permission.
 */

/** 微信 CI 配置；本文件只读到这三个字段。 */
type WechatCiSettings = {
  robotPreview?: number | string | null;
  robotUpload?: number | string | null;
  descTemplate?: string | null;
};

/** 项目小程序运行时配置（本文件只读到的字段）。 */
type MiniProgramRuntime = MiniprogramRuntimeConfig & {
  enabled?: boolean;
  appId?: string | null;
  miniprogramAppId?: string | null;
  entryPage?: string | null;
  wechatCi?: WechatCiSettings | null;
  secrets?: { wechat_upload_key?: string } | null;
};

/** `resolveMiniprogramRuntime` 声明返回 `Readonly<Record<string, unknown>>`，这里补上读到的键。 */
type ResolvedRuntime = Readonly<Record<string, unknown>> & {
  channel?: string;
  environment?: string;
  cloudbase?: { envId?: string | null } | null;
};

/** miniprogram-ci 的最小形状：只声明本文件真正调用到的成员。 */
type MiniprogramCi = {
  Project: new (options: {
    /** prepareRelease 已确保 appId 非空；这里保留可空是为了调用处不必再断言。 */
    appid?: string | null;
    type: string;
    projectPath: string;
    privateKey: string;
    ignores: string[];
  }) => unknown;
  preview(options: Record<string, unknown>): Promise<unknown>;
  upload(options: Record<string, unknown>): Promise<unknown>;
};

/** 测试用的 CI 工厂。 */
type CiFactory = () => Promise<MiniprogramCi>;

/** 发布动作所需的 Service 视图。 */
type WechatCiService = {
  db: Db;
  member(user: WechatCiUser, projectId: string, write?: boolean): Promise<unknown>;
};

/** 发起发布的人。 */
type WechatCiUser = { id: string; kind?: string | null };

/** 生成 project.config.json 的计划：合成的自带内容，已有的只给版本 id。 */
type ProjectConfigPlan =
  { synthesized: true; content: string } | { synthesized: false; content: null; versionId: string };

/** 隔离进程一次调用的入参。 */
type IsolatedStepRequest = { requestPath: string; resultPath: string; projectPath: string };

/** 隔离进程一次调用的选项。 */
type IsolatedStepOptions = { timeoutMs?: number };

/** 隔离进程一次的结局。 */
type IsolatedStepOutcome = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  spawnError?: boolean;
};

/** 子进程写回的结果文件。 */
type StepResult = { ok?: boolean; log?: string; error?: string; result?: unknown };

/** 一次发布步骤的请求（同一结构同时用于 in-process 与子进程两条路径）。 */
type ReleaseStepRequest = {
  action: string;
  appid?: string | null;
  projectPath?: string;
  privateKey: string;
  qrcodeOutputDest?: string;
  version?: string;
  desc?: string;
  robot?: number;
  pagePath?: string;
};

/** 一次发布步骤的结局。 */
type ReleaseStepOutcome =
  { ok: true; result: unknown; log: string } | { ok: false; error: string; log: string };

/** prepareRelease 的可选项。 */
type PrepareOptions = { allowUnverified?: boolean };

/** 发布记录的入参。 */
type DeploymentEntry = {
  projectId: string;
  miniprogramAppId?: string | null;
  target: string;
  environment?: string | null;
  version?: string | null;
  url?: string | null;
  sourceHash?: string | null;
  status: string;
  log?: string | null;
  publishedBy?: string | null;
};

/** `miniprogram_deployments` 的一行。 */
type DeploymentRow = {
  id: string;
  project_id: string;
  target: string;
  environment: string | null;
  version: string | null;
  url: string | null;
  source_hash: string | null;
  status: string;
  log?: string | null;
  published_by: string | null;
  published_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string | null;
  operator_name?: string | null;
};

export const WECHAT_KEY_MAX_BYTES = 64 * 1024;

/** Sniff the real image type: WeChat returns JPEG for qrcodeFormat "image". */
export function detectImageMime(buffer: Buffer): string {
  const b = buffer;
  if (!b || b.length < 4) return "application/octet-stream";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (b.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "application/octet-stream";
}
export const WECHAT_QR_MAX_BYTES = 1024 * 1024;
export const WECHAT_RELEASE_TARGETS = ["wechat_preview", "wechat_upload"];

const PROJECT_CONFIG = "project.config.json";

/** Strip key material and anything key-shaped from provider output. */
export function redactSecrets(value: unknown, extra: string[] = []): string {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  for (const secret of extra) {
    if (!secret) continue;
    const trimmed = String(secret).trim();
    if (trimmed.length < 8) continue;
    text = text.split(trimmed).join("[redacted]");
  }
  return text
    .replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g, "[redacted]")
    .replace(/\bAKID[A-Za-z0-9]{12,}\b/g, "[redacted]")
    .slice(0, 64 * 1024);
}

export function readWechatCiSettings(runtime: MiniProgramRuntime): {
  robotPreview: number;
  robotUpload: number;
  descTemplate: string | null;
} {
  const ci = runtime.wechatCi || {};
  return {
    robotPreview: clampRobot(ci.robotPreview ?? 1),
    robotUpload: clampRobot(ci.robotUpload ?? 1),
    descTemplate: ci.descTemplate || null,
  };
}

function clampRobot(value: unknown): number {
  const robot = Number(value);
  if (!Number.isInteger(robot) || robot < 1 || robot > 30) {
    throw new HttpError(400, "微信 CI 机器人编号须为 1–30 的整数");
  }
  return robot;
}

export function buildReleaseDesc(
  template: string | null | undefined,
  input: { desc?: string | null; version?: string | null },
): string {
  const fallback = input.desc || "";
  if (!template) return fallback.slice(0, 200);
  return String(template)
    .replaceAll("{version}", input.version || "")
    .replaceAll("{date}", new Date().toISOString().slice(0, 10))
    .slice(0, 200);
}

/**
 * WeChat CI needs a project.config.json with an appid. Use the project's own
 * file when the source area provides one, otherwise synthesize a minimal
 * config from the project settings so Dimina-style sources still work.
 */
export function resolveProjectConfig(
  files: MiniprogramFile[] | null | undefined,
  appId: string,
): ProjectConfigPlan {
  // Same-named files can only exist if something bypassed the publish API; take
  // the last one so the newest write wins deterministically.
  const existing = Array.isArray(files)
    ? [...files].reverse().find((file) => file.path === PROJECT_CONFIG)
    : null;
  if (!existing) {
    return {
      synthesized: true,
      content: JSON.stringify(
        {
          appid: appId,
          projectname: "cothread-miniprogram",
          compileType: "miniprogram",
          miniprogramRoot: "./",
          setting: { es6: true, minified: false },
        },
        null,
        2,
      ),
    };
  }
  return { synthesized: false, content: null, versionId: existing.versionId };
}

function parseProjectConfig(raw: string): { appid?: unknown } | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function materializeProject(
  db: Db,
  projectId: string,
  appId: string,
  dir: string,
  runtimeConfig: ResolvedRuntime,
) {
  const snapshot = await miniprogramSnapshot(db, projectId);
  const sources = snapshot.areas.miniprogram_source?.files || [];
  if (!sources.length) throw new HttpError(409, "小程序源文件目录为空，请先写入源码");
  for (const file of sources) {
    const target = join(dir, ...String(file.path).split("/"));
    await mkdir(dirname(target), { recursive: true });
    const [row] = await query<{ content: Buffer }>(db, "SELECT content FROM versions WHERE id=?", [
      file.versionId,
    ]);
    if (!row) throw new HttpError(409, `源码版本已不存在：${file.path}`);
    const content = /^(app|game)\.(js|ts)$/i.test(String(file.path))
      ? injectMiniprogramRuntimeSource(row.content, file.path, runtimeConfig)
      : row.content;
    await writeFile(target, content);
  }
  const plan = resolveProjectConfig(sources, appId);
  if (plan.synthesized) {
    await writeFile(join(dir, PROJECT_CONFIG), plan.content, "utf8");
    return { snapshot, synthesized: true, projectAppId: appId };
  }
  const [row] = await query<{ content: Buffer }>(db, "SELECT content FROM versions WHERE id=?", [
    plan.versionId,
  ]);
  const parsed = parseProjectConfig(row?.content?.toString("utf8") || "");
  const projectAppId = String(parsed?.appid || "").trim();
  if (projectAppId && projectAppId !== appId) {
    throw new HttpError(
      409,
      `项目内的 ${PROJECT_CONFIG} appid 为 ${projectAppId}，与项目配置的 ${appId} 不一致；请统一后重试`,
    );
  }
  return { snapshot, synthesized: false, projectAppId: projectAppId || appId };
}

/**
 * WeChat's console gives the upload key as a bare base64 body (usually PKCS#1
 * `RSAPrivateKey`), while miniprogram-ci/OpenSSL needs a real PEM. Passing the
 * raw text produced `DECODER routines::unsupported` (errCode 20002), so the key
 * is normalized here: a PEM is passed through, a bare body is wrapped in the
 * header that actually parses.
 */
export function normalizeWechatPrivateKey(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) throw new HttpError(409, "尚未配置代码上传密钥");
  if (raw.includes("-----BEGIN")) return raw.endsWith("\n") ? raw : `${raw}\n`;

  const body = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new HttpError(400, "代码上传密钥既不是 PEM，也不是合法的 base64 内容");
  }
  const asPem = (label: string) =>
    `-----BEGIN ${label}-----\n${(body.match(/.{1,64}/g) || []).join("\n")}\n-----END ${label}-----\n`;

  for (const label of ["PRIVATE KEY", "RSA PRIVATE KEY"]) {
    const pem = asPem(label);
    try {
      createPrivateKey(pem);
      return pem;
    } catch {
      // try the next envelope
    }
  }
  throw new HttpError(
    400,
    "代码上传密钥无法解析：既不是 PKCS#8（PRIVATE KEY）也不是 PKCS#1（RSA PRIVATE KEY）；请从微信公众平台重新下载上传密钥",
  );
}

let ciFactoryOverride: CiFactory | null = null;
let runnerOverride: string | null = null;

/**
 * Test seam: run the release step in-process with a fake CI module. Production
 * always goes through the isolated runner below.
 */
export function setWechatCiFactory(factory: CiFactory | null): void {
  ciFactoryOverride = factory;
}

/** Test seam: replace the isolated runner script. */
export function setWechatCiRunner(path: string | null): void {
  runnerOverride = path;
}

export function wechatCiRunnerPath(): string {
  if (runnerOverride) return runnerOverride;
  return join(dirname(fileURLToPath(import.meta.url)), "wechat-ci-runner.mjs");
}

/**
 * Run one release step in a separate process. miniprogram-ci can let a provider
 * error escape as an uncaught exception; isolating it means the worst case is a
 * failed release instead of a dead API process.
 */
function runIsolatedStep(
  request: IsolatedStepRequest,
  { timeoutMs = Number(process.env.WECHAT_CI_TIMEOUT_MS || 600_000) }: IsolatedStepOptions = {},
): Promise<IsolatedStepOutcome> {
  const runner = wechatCiRunnerPath();
  return new Promise<IsolatedStepOutcome>((resolve) => {
    const child = spawn(process.execPath, [runner, request.requestPath, request.resultPath], {
      cwd: request.projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value: IsolatedStepOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ timedOut: true, code: null, stdout, stderr });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < 200_000) stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 200_000) stderr += chunk.toString();
    });
    child.on("error", (error) =>
      finish({ code: null, stdout, stderr: `${stderr}${error.message}`, spawnError: true }),
    );
    child.on("close", (code) => finish({ code, stdout, stderr }));
  });
}

/** Read the runner's result file, tolerating a crash that left none behind. */
async function readStepResult(resultPath: string): Promise<StepResult | null> {
  try {
    return JSON.parse(await readFile(resultPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Execute preview/upload. Uses the in-process fake when a test injected one,
 * otherwise the isolated runner.
 */
async function executeReleaseStep(
  prepared: PreparedRelease,
  request: ReleaseStepRequest,
): Promise<ReleaseStepOutcome> {
  if (ciFactoryOverride) {
    const ci = await ciFactoryOverride();
    const project = new ci.Project({
      appid: prepared.runtime.appId,
      type: "miniProgram",
      projectPath: prepared.dir,
      privateKey: request.privateKey,
      ignores: ["node_modules/**/*"],
    });
    if (request.action === "preview") {
      let log = "";
      const result = await ci.preview({
        project,
        desc: request.desc,
        setting: { useProjectConfig: true },
        qrcodeFormat: "image",
        qrcodeOutputDest: request.qrcodeOutputDest,
        robot: request.robot,
        ...(request.pagePath ? { pagePath: request.pagePath } : {}),
        onProgressUpdate: (update: unknown) => {
          log += `${typeof update === "string" ? update : JSON.stringify(update)}\n`;
        },
      });
      return { ok: true, result, log };
    }
    let log = "";
    const result = await ci.upload({
      project,
      version: request.version,
      desc: request.desc,
      setting: { useProjectConfig: true },
      robot: request.robot,
      onProgressUpdate: (update: unknown) => {
        log += `${typeof update === "string" ? update : JSON.stringify(update)}\n`;
      },
    });
    return { ok: true, result, log };
  }

  const requestPath = join(prepared.dir, "ci-request.json");
  const resultPath = join(prepared.dir, "ci-result.json");
  await writeFile(requestPath, JSON.stringify(request), { encoding: "utf8", mode: 0o600 });
  const outcome = await runIsolatedStep({
    requestPath,
    resultPath,
    projectPath: prepared.dir,
  });
  const parsed = await readStepResult(resultPath);
  const combinedLog = `${parsed?.log || ""}${outcome.stdout || ""}${outcome.stderr || ""}`;
  if (outcome.timedOut) {
    return { ok: false, error: "微信 CI 超时未返回（可能是网络或凭据问题）", log: combinedLog };
  }
  if (parsed?.ok) return { ok: true, result: parsed.result, log: combinedLog };
  const error =
    parsed?.error ||
    (outcome.spawnError
      ? "无法启动微信 CI 运行进程"
      : `微信 CI 进程异常退出（exit ${outcome.code}）`);
  return { ok: false, error, log: combinedLog };
}

async function prepareRelease(
  service: WechatCiService,
  projectId: string,
  channel: string,
  { allowUnverified = false }: PrepareOptions = {},
) {
  const runtime = (await loadProjectMiniProgramRuntime(
    service,
    projectId,
  )) as unknown as MiniProgramRuntime;
  if (!runtime.enabled && !allowUnverified)
    throw new HttpError(409, "小程序工作区尚未通过连接测试");
  if (!runtime.appId) throw new HttpError(409, "尚未配置微信小程序 AppID");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, channel) as ResolvedRuntime;
  const storedKey = runtime.secrets?.wechat_upload_key;
  if (!storedKey) throw new HttpError(409, "尚未配置代码上传密钥");
  if (Buffer.byteLength(storedKey, "utf8") > WECHAT_KEY_MAX_BYTES) {
    throw new HttpError(413, "代码上传密钥超出体积上限");
  }
  const privateKey = normalizeWechatPrivateKey(storedKey);
  const settings = readWechatCiSettings(runtime);
  const dir = await mkdtemp(join(tmpdir(), "cothread-wechat-"));
  try {
    const prepared = await materializeProject(
      service.db,
      projectId,
      runtime.appId,
      dir,
      runtimeConfig,
    );
    return { runtime, runtimeConfig, settings, dir, privateKey, ...prepared };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/** prepareRelease 的产物形状。 */
type PreparedRelease = Awaited<ReturnType<typeof prepareRelease>>;

/** Extract appid/version metadata WeChat returns, without leaking internals. */
function summarizeResult(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const source = result as {
    subPackageInfo?: unknown;
    pluginInfo?: unknown;
    devPluginId?: unknown;
  };
  const summary: Record<string, unknown> = {};
  if (source.subPackageInfo) summary.subPackageInfo = source.subPackageInfo;
  if (source.pluginInfo) summary.pluginInfo = source.pluginInfo;
  if (source.devPluginId) summary.devPluginId = source.devPluginId;
  return Object.keys(summary).length ? summary : null;
}

async function recordDeployment(db: Db, entry: DeploymentEntry): Promise<string> {
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO miniprogram_deployments
       (id,project_id,miniprogram_app_id,target,environment,version,url,source_hash,status,log,published_by,published_at,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
    [
      id,
      entry.projectId,
      entry.miniprogramAppId || null,
      entry.target,
      entry.environment || "wechat",
      entry.version || null,
      entry.url || null,
      entry.sourceHash || null,
      entry.status,
      entry.log ? entry.log.slice(0, 60_000) : null,
      entry.publishedBy || null,
    ],
  );
  return id;
}

export async function listMiniprogramDeployments(
  service: WechatCiService,
  user: WechatCiUser,
  projectId: string,
  { limit = 20 }: { limit?: number } = {},
) {
  await service.member(user, projectId, false);
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await query<DeploymentRow>(
    service.db,
    `SELECT d.id,d.target,d.environment,d.version,d.url,d.source_hash,d.status,d.published_by,d.published_at,d.confirmed_by,d.confirmed_at,d.created_at,u.name AS operator_name
     FROM miniprogram_deployments d
     LEFT JOIN users u ON u.id=d.published_by
     WHERE d.project_id=?
     ORDER BY d.created_at DESC LIMIT ${size}`,
    [projectId],
  );
  return {
    deployments: rows.map((row) => ({
      id: row.id,
      target: row.target,
      environment: row.environment,
      version: row.version,
      url: row.url,
      sourceHash: row.source_hash,
      status: row.status,
      publishedBy: row.published_by,
      operatorName: row.operator_name || null,
      publishedAt: row.published_at,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
    })),
  };
}

/** Generate a preview QR code from the current source snapshot. */
export async function previewMiniprogram(
  service: WechatCiService,
  actor: WechatCiUser,
  projectId: string,
  input: unknown = {},
  options: PrepareOptions = {},
) {
  const data = z
    .object({
      desc: z.string().trim().max(200).optional(),
      pagePath: z.string().trim().max(255).optional(),
      robot: z.union([z.number(), z.string()]).optional(),
    })
    .parse(input || {});

  const prepared = await prepareRelease(service, projectId, "wechat_preview", options);
  const startedAt = Date.now();
  let log = "";
  try {
    const qrcodeOutputDest = join(prepared.dir, "preview-qrcode.png");
    const desc = buildReleaseDesc(prepared.settings.descTemplate, {
      desc: data.desc,
      version: "",
    });
    const step = await executeReleaseStep(prepared, {
      action: "preview",
      appid: prepared.runtime.appId,
      projectPath: prepared.dir,
      privateKey: prepared.privateKey,
      qrcodeOutputDest,
      desc: desc || "共序预览",
      robot: data.robot ? clampRobot(data.robot) : prepared.settings.robotPreview,
      ...(data.pagePath ? { pagePath: data.pagePath } : {}),
    });
    log += step.log || "";
    if (!step.ok) throw new Error(step.error);
    const result = step.result;

    let qrBase64: string | null = null;
    let qrMime: string | null = null;
    try {
      const info = await stat(qrcodeOutputDest);
      if (info.size <= WECHAT_QR_MAX_BYTES) {
        const buffer = await readFile(qrcodeOutputDest);
        qrBase64 = buffer.toString("base64");
        // WeChat writes a JPEG even though the option is called "image"; report
        // what the bytes actually are instead of assuming PNG.
        qrMime = detectImageMime(buffer);
      }
    } catch {
      qrBase64 = null;
      qrMime = null;
    }

    const deploymentId = await recordDeployment(service.db, {
      projectId,
      miniprogramAppId: prepared.runtime.miniprogramAppId,
      target: "wechat_preview",
      environment: prepared.runtimeConfig.environment,
      version: null,
      sourceHash: prepared.snapshot.sourceHash,
      status: "succeeded",
      log: redactSecrets(log, [prepared.privateKey]),
      publishedBy: actor.id,
    });
    return {
      deploymentId,
      status: "succeeded",
      appId: prepared.runtime.appId,
      environment: prepared.runtimeConfig.environment,
      envId: prepared.runtimeConfig.cloudbase?.envId || null,
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      desc: desc || "共序预览",
      qrcodeBase64: qrBase64,
      qrcodeMime: qrMime,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    const detail = redactSecrets(errorLike(error).message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
      miniprogramAppId: prepared.runtime.miniprogramAppId,
      target: "wechat_preview",
      environment: prepared.runtimeConfig.environment,
      sourceHash: prepared.snapshot?.sourceHash || null,
      status: "failed",
      log: redactSecrets(`${log}\n${detail}`, [prepared.privateKey]),
      publishedBy: actor.id,
    });
    throw new HttpError(502, `微信预览生成失败：${detail}`);
  } finally {
    await rm(prepared.dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** `catch` 参数是 `unknown`；这里只取代码真正读到的 `message`。 */
function errorLike(error: unknown): { message?: string; name?: string } {
  return typeof error === "object" && error !== null
    ? (error as { message?: string; name?: string })
    : {};
}

/** Upload a candidate experience version to WeChat. */
export async function uploadMiniprogram(
  service: WechatCiService,
  actor: WechatCiUser,
  projectId: string,
  input: unknown = {},
) {
  await service.member(actor, projectId, true);
  const data = z
    .object({
      version: z.string().trim().min(1).max(64),
      desc: z.string().trim().max(200).optional(),
      robot: z.union([z.number(), z.string()]).optional(),
    })
    .parse(input || {});

  const prepared = await prepareRelease(service, projectId, "wechat_upload");
  const startedAt = Date.now();
  let log = "";
  try {
    const desc = buildReleaseDesc(prepared.settings.descTemplate, {
      desc: data.desc,
      version: data.version,
    });
    const step = await executeReleaseStep(prepared, {
      action: "upload",
      appid: prepared.runtime.appId,
      projectPath: prepared.dir,
      privateKey: prepared.privateKey,
      version: data.version,
      desc: desc || `v${data.version}`,
      robot: data.robot ? clampRobot(data.robot) : prepared.settings.robotUpload,
    });
    log += step.log || "";
    if (!step.ok) throw new Error(step.error);
    const result = step.result;

    const deploymentId = await recordDeployment(service.db, {
      projectId,
      miniprogramAppId: prepared.runtime.miniprogramAppId,
      target: "wechat_upload",
      environment: prepared.runtimeConfig.environment,
      version: data.version,
      sourceHash: prepared.snapshot.sourceHash,
      status: "succeeded",
      log: redactSecrets(log, [prepared.privateKey]),
      publishedBy: actor.id,
    });
    return {
      deploymentId,
      status: "succeeded",
      appId: prepared.runtime.appId,
      environment: prepared.runtimeConfig.environment,
      envId: prepared.runtimeConfig.cloudbase?.envId || null,
      version: data.version,
      desc: desc || `v${data.version}`,
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    const detail = redactSecrets(errorLike(error).message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
      miniprogramAppId: prepared.runtime.miniprogramAppId,
      target: "wechat_upload",
      environment: prepared.runtimeConfig.environment,
      version: data.version,
      sourceHash: prepared.snapshot?.sourceHash || null,
      status: "failed",
      log: redactSecrets(`${log}\n${detail}`, [prepared.privateKey]),
      publishedBy: actor.id,
    });
    throw new HttpError(502, `微信上传失败：${detail}`);
  } finally {
    await rm(prepared.dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function readMiniprogramDeployment(
  service: WechatCiService,
  user: WechatCiUser,
  projectId: string,
  deploymentId: string,
) {
  await service.member(user, projectId, false);
  const [row] = await query<DeploymentRow>(
    service.db,
    `SELECT id,project_id,target,environment,version,url,source_hash,status,log,published_by,published_at,
       confirmed_by,confirmed_at,created_at
     FROM miniprogram_deployments WHERE id=?`,
    [deploymentId],
  );
  if (!row || row.project_id !== projectId) throw new HttpError(404, "发布记录不存在");
  return {
    id: row.id,
    target: row.target,
    environment: row.environment,
    version: row.version,
    url: row.url,
    sourceHash: row.source_hash,
    status: row.status,
    log: row.log || "",
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

/** Stable hash helper reused by tests and future deploy targets. */
export function contentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
