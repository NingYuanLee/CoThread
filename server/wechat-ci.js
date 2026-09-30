import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
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
 * Uploading a release is a production action: it requires a human session
 * actor unless the caller explicitly confirms.
 */

export const WECHAT_KEY_MAX_BYTES = 64 * 1024;
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

async function materializeProject(db, projectId, appId, dir) {
  const snapshot = await miniprogramSnapshot(db, projectId);
  const sources = snapshot.areas.miniprogram_source?.files || [];
  if (!sources.length) throw new HttpError(409, "小程序源文件目录为空，请先写入源码");
  for (const file of sources) {
    const target = join(dir, ...String(file.path).split("/"));
    await mkdir(dirname(target), { recursive: true });
    const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [file.versionId]);
    if (!row) throw new HttpError(409, `源码版本已不存在：${file.path}`);
    await writeFile(target, row.content);
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

async function writePrivateKey(dir, keyText) {
  const path = join(dir, "cothread-wechat-upload.key");
  await writeFile(path, keyText, { mode: 0o600 });
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

async function prepareRelease(service, projectId) {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) throw new HttpError(409, "该项目尚未启用小程序全量工作区");
  if (!runtime.appId) throw new HttpError(409, "尚未配置微信小程序 AppID");
  const privateKey = runtime.secrets?.wechat_upload_key;
  if (!privateKey) throw new HttpError(409, "尚未配置微信上传私钥");
  if (Buffer.byteLength(privateKey, "utf8") > WECHAT_KEY_MAX_BYTES) {
    throw new HttpError(413, "微信上传私钥超出体积上限");
  }
  const settings = readWechatCiSettings(runtime);
  const dir = await mkdtemp(join(tmpdir(), "cothread-wechat-"));
  try {
    const prepared = await materializeProject(service.db, projectId, runtime.appId, dir);
    return { runtime, settings, dir, privateKey, ...prepared };
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
export async function previewMiniprogram(service, actor, projectId, input = {}) {
  const data = z
    .object({
      desc: z.string().trim().max(200).optional(),
      pagePath: z.string().trim().max(255).optional(),
      robot: z.union([z.number(), z.string()]).optional(),
    })
    .parse(input || {});

  const prepared = await prepareRelease(service, projectId);
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
    try {
      const info = await stat(qrcodeOutputDest);
      if (info.size <= WECHAT_QR_MAX_BYTES) {
        qrBase64 = (await readFile(qrcodeOutputDest)).toString("base64");
      }
    } catch {
      qrBase64 = null;
    }

    const deploymentId = await recordDeployment(service.db, {
      projectId,
      target: "wechat_preview",
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
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      desc: desc || "共序预览",
      qrcodeBase64: qrBase64,
      qrcodeMime: qrBase64 ? "image/png" : null,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    const detail = redactSecrets(error?.message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
      target: "wechat_preview",
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

/**
 * Upload a candidate version to WeChat. Releasing is a production action, so a
 * non-human actor must pass an explicit confirmation.
 */
export async function uploadMiniprogram(service, actor, projectId, input = {}) {
  const data = z
    .object({
      version: z.string().trim().min(1).max(64),
      desc: z.string().trim().max(200).optional(),
      robot: z.union([z.number(), z.string()]).optional(),
      // 发布授权只能来自审批流：没有任何旁路能上传版本。
      authorization: z
        .object({ requestId: z.string().uuid(), approvedBy: z.string().uuid() })
        .optional(),
    })
    .parse(input || {});

  if (!data.authorization) {
    throw new HttpError(
      403,
      "上传微信版本只能经发布审批流执行：请先提交发布申请，由项目负责人批准",
    );
  }

  const prepared = await prepareRelease(service, projectId);
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
      version: data.version,
      sourceHash: prepared.snapshot.sourceHash,
      status: "succeeded",
      log: redactSecrets(log, [prepared.privateKey]),
      publishedBy: actor.id,
    });
    await query(
      service.db,
      `UPDATE miniprogram_deployments SET confirmed_by=?,confirmed_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [actor.id, deploymentId],
    );
    return {
      deploymentId,
      status: "succeeded",
      appId: prepared.runtime.appId,
      version: data.version,
      desc: desc || `v${data.version}`,
      projectConfigSynthesized: prepared.synthesized,
      sourceHash: prepared.snapshot.sourceHash,
      confirmedBy: actor.id,
      elapsedMs: Date.now() - startedAt,
      summary: summarizeResult(result),
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) throw error;
    const detail = redactSecrets(error?.message || String(error), [prepared.privateKey]);
    await recordDeployment(service.db, {
      projectId,
      target: "wechat_upload",
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
