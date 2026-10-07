import { randomUUID, createHash, createPrivateKey } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import {
  injectMiniprogramRuntimeSource,
  resolveMiniprogramRuntime,
} from "./miniprogram-runtime-environment.js";
import { miniprogramSnapshot } from "./miniprogram-workspace.js";

/**
 * WeChat release path (miniprogram-ci).
 *
 * Two hard rules:
 *  1. The upload private key exists on disk only for the duration of one call
 *     and is written to a throwaway directory with owner-only permissions.
 *  2. Nothing that reaches a log, an event row or a response may contain the
 *     key material, so every provider message passes through redactSecrets.
 *
 * Uploading creates a WeChat experience version. Review and production release
 * still happen in WeChat, so CoThread only requires project write permission.
 */

export const WECHAT_KEY_MAX_BYTES = 64 * 1024;

/** Sniff the real image type: WeChat returns JPEG for qrcodeFormat "image". */
export function detectImageMime(buffer) {
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
export function redactSecrets(value, extra = []) {
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

export function readWechatCiSettings(runtime) {
  const ci = runtime.wechatCi || {};
  return {
    robotPreview: clampRobot(ci.robotPreview ?? 1),
    robotUpload: clampRobot(ci.robotUpload ?? 1),
    descTemplate: ci.descTemplate || null,
  };
}

function clampRobot(value) {
  const robot = Number(value);
  if (!Number.isInteger(robot) || robot < 1 || robot > 30) {
    throw new HttpError(400, "微信 CI 机器人编号须为 1–30 的整数");
  }
  return robot;
}

export function buildReleaseDesc(template, input) {
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
export function resolveProjectConfig(files, appId) {
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

export function parseProjectConfig(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function materializeProject(db, projectId, appId, dir, runtimeConfig) {
  const snapshot = await miniprogramSnapshot(db, projectId);
  const sources = snapshot.areas.miniprogram_source?.files || [];
  if (!sources.length) throw new HttpError(409, "小程序源文件目录为空，请先写入源码");
  for (const file of sources) {
    const target = join(dir, ...String(file.path).split("/"));
    await mkdir(dirname(target), { recursive: true });
    const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [file.versionId]);
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
  const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [plan.versionId]);
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
 * `RSAPrivateKey`), while miniprogram-ci/OpenSSL needs a real PEM. Writing the
 * raw text produced `DECODER routines::unsupported` (errCode 20002), so the key
 * is normalized here: a PEM is passed through, a bare body is wrapped in the
 * header that actually parses.
 */
export function normalizeWechatPrivateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new HttpError(409, "尚未配置微信上传私钥");
  if (raw.includes("-----BEGIN")) return raw.endsWith("\n") ? raw : `${raw}\n`;

  const body = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new HttpError(400, "微信上传私钥既不是 PEM，也不是合法的 base64 内容");
  }
  const asPem = (label) =>
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
    "微信上传私钥无法解析：既不是 PKCS#8（PRIVATE KEY）也不是 PKCS#1（RSA PRIVATE KEY）；请从微信公众平台重新下载上传密钥",
  );
}

async function writePrivateKey(dir, keyText) {
  const path = join(dir, "cothread-wechat-upload.key");
  await writeFile(path, normalizeWechatPrivateKey(keyText), { mode: 0o600 });
  return path;
}

let ciFactoryOverride = null;
let runnerOverride = null;

/**
 * Test seam: run the release step in-process with a fake CI module. Production
 * always goes through the isolated runner below.
 */
export function setWechatCiFactory(factory) {
  ciFactoryOverride = factory;
}

/** Test seam: replace the isolated runner script. */
export function setWechatCiRunner(path) {
  runnerOverride = path;
}

export function wechatCiRunnerPath() {
  if (runnerOverride) return runnerOverride;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "runtime", "wechat-ci-runner.mjs");
}

/**
 * Run one release step in a separate process. miniprogram-ci can let a provider
 * error escape as an uncaught exception; isolating it means the worst case is a
 * failed release instead of a dead API process.
 */
function runIsolatedStep(
  request,
  { timeoutMs = Number(process.env.WECHAT_CI_TIMEOUT_MS || 600_000) } = {},
) {
  const runner = wechatCiRunnerPath();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, request.requestPath, request.resultPath], {
      cwd: request.projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
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
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut: false }));
  });
}

/** Read the runner's result file, tolerating a crash that left none behind. */
async function readStepResult(resultPath) {
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
async function executeReleaseStep(prepared, request) {
  if (ciFactoryOverride) {
    const ci = await ciFactoryOverride();
    const project = new ci.Project({
      appid: prepared.runtime.appId,
      type: "miniProgram",
      projectPath: prepared.dir,
      privateKeyPath: join(prepared.dir, "cothread-wechat-upload.key"),
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
        onProgressUpdate: (update) => {
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
      onProgressUpdate: (update) => {
        log += `${typeof update === "string" ? update : JSON.stringify(update)}\n`;
      },
    });
    return { ok: true, result, log };
  }

  const requestPath = join(prepared.dir, "ci-request.json");
  const resultPath = join(prepared.dir, "ci-result.json");
  await writeFile(requestPath, JSON.stringify(request), "utf8");
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

async function prepareRelease(service, projectId, channel, { allowUnverified = false } = {}) {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled && !allowUnverified) throw new HttpError(409, "小程序工作区尚未通过连接测试");
  if (!runtime.appId) throw new HttpError(409, "尚未配置微信小程序 AppID");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, channel);
  const privateKey = runtime.secrets?.wechat_upload_key;
  if (!privateKey) throw new HttpError(409, "尚未配置微信上传私钥");
  if (Buffer.byteLength(privateKey, "utf8") > WECHAT_KEY_MAX_BYTES) {
    throw new HttpError(413, "微信上传私钥超出体积上限");
  }
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

/** Extract appid/version metadata WeChat returns, without leaking internals. */
function summarizeResult(result) {
  if (!result || typeof result !== "object") return null;
  const summary = {};
  if (result.subPackageInfo) summary.subPackageInfo = result.subPackageInfo;
  if (result.pluginInfo) summary.pluginInfo = result.pluginInfo;
  if (result.devPluginId) summary.devPluginId = result.devPluginId;
  return Object.keys(summary).length ? summary : null;
}

async function recordDeployment(db, entry) {
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO miniprogram_deployments
       (id,project_id,target,environment,version,url,source_hash,status,log,published_by,published_at,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
    [
      id,
      entry.projectId,
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

export async function listMiniprogramDeployments(service, user, projectId, { limit = 20 } = {}) {
  await service.member(user, projectId, false);
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await query(
    service.db,
    `SELECT id,target,environment,version,url,source_hash,status,published_by,published_at,confirmed_by,confirmed_at,created_at
     FROM miniprogram_deployments WHERE project_id=?
     ORDER BY created_at DESC LIMIT ${size}`,
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
      publishedAt: row.published_at,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
    })),
  };
}

/** Generate a preview QR code from the current source snapshot. */
export async function previewMiniprogram(service, actor, projectId, input = {}, options = {}) {
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
    const privateKeyPath = await writePrivateKey(prepared.dir, prepared.privateKey);
    const qrcodeOutputDest = join(prepared.dir, "preview-qrcode.png");
    const desc = buildReleaseDesc(prepared.settings.descTemplate, {
      desc: data.desc,
      version: "",
    });
    const step = await executeReleaseStep(prepared, {
      action: "preview",
      appid: prepared.runtime.appId,
      projectPath: prepared.dir,
      privateKeyPath,
      qrcodeOutputDest,
      desc: desc || "共序预览",
      robot: data.robot ? clampRobot(data.robot) : prepared.settings.robotPreview,
      ...(data.pagePath ? { pagePath: data.pagePath } : {}),
    });
    log += step.log || "";
    if (!step.ok) throw new Error(step.error);
    const result = step.result;

    let qrBase64 = null;
    let qrMime = null;
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
      envId: prepared.runtimeConfig.cloudbase.envId,
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      desc: desc || "共序预览",
      qrcodeBase64: qrBase64,
      qrcodeMime: qrMime,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    const detail = redactSecrets(error?.message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
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

/** Upload a candidate experience version to WeChat. */
export async function uploadMiniprogram(service, actor, projectId, input = {}) {
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
    const privateKeyPath = await writePrivateKey(prepared.dir, prepared.privateKey);
    const desc = buildReleaseDesc(prepared.settings.descTemplate, {
      desc: data.desc,
      version: data.version,
    });
    const step = await executeReleaseStep(prepared, {
      action: "upload",
      appid: prepared.runtime.appId,
      projectPath: prepared.dir,
      privateKeyPath,
      version: data.version,
      desc: desc || `v${data.version}`,
      robot: data.robot ? clampRobot(data.robot) : prepared.settings.robotUpload,
    });
    log += step.log || "";
    if (!step.ok) throw new Error(step.error);
    const result = step.result;

    const deploymentId = await recordDeployment(service.db, {
      projectId,
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
      envId: prepared.runtimeConfig.cloudbase.envId,
      version: data.version,
      desc: desc || `v${data.version}`,
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    const detail = redactSecrets(error?.message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
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

export async function readMiniprogramDeployment(service, user, projectId, deploymentId) {
  await service.member(user, projectId, false);
  const [row] = await query(
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
export function contentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
