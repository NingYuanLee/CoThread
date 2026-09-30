import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import { miniprogramSnapshot } from "./miniprogram-workspace.js";
import { getCloudbaseManager } from "./cloudbase.js";

/**
 * PC 管理后台的 CloudBase 静态托管发布。
 *
 * 一个刻意划定的边界：**服务端不执行项目配置里的 buildCommand**。
 * 那等于让「项目配置」在服务进程里跑任意代码；构建应当发生在 Agent 的沙箱里，
 * 产物写进 admin 目录，服务端只做「物化 → 上传 → 记录」。因此这里要求
 * 上传集合的根部必须有 index.html，否则拒绝并提示先在沙箱里构建。
 *
 * 环境限定：只有 development 允许由 Agent 触发；生产环境需项目负责人在界面确认
 * （由审批流表达，见 server/release-requests.js）。
 */

export const HOSTING_MAX_FILES = 2000;
export const HOSTING_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Normalize a hosting path to a cloudPath with no leading slash. */
export function normalizeCloudPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  if (raw.includes("..")) throw new HttpError(400, "托管路径非法");
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Pick the files to upload: the configured distDir when the admin area provides
 * one, otherwise the whole admin area. Paths are relative to the upload root.
 */
export function selectHostingFiles(files, distDir) {
  const prefix = normalizeCloudPath(distDir);
  const scoped = [];
  for (const file of files) {
    const path = String(file.path || "").replace(/^\/+/, "");
    if (!path) continue;
    if (prefix) {
      if (path === prefix) continue;
      if (!path.startsWith(`${prefix}/`)) continue;
      scoped.push({ ...file, relative: path.slice(prefix.length + 1) });
    } else {
      scoped.push({ ...file, relative: path });
    }
  }
  return scoped;
}

export function assertHostingPayload(entries) {
  if (!entries.length) {
    throw new HttpError(
      409,
      "Admin 产物为空：请先在沙箱内执行构建，并把产物写入小程序工作区的「PC 管理后台」目录",
    );
  }
  if (entries.length > HOSTING_MAX_FILES) {
    throw new HttpError(413, `Admin 产物文件数超出上限（${HOSTING_MAX_FILES}）`);
  }
  const total = entries.reduce((sum, entry) => sum + (Number(entry.byteSize) || 0), 0);
  if (total > HOSTING_MAX_TOTAL_BYTES) {
    throw new HttpError(413, "Admin 产物总体积超出上限");
  }
  if (!entries.some((entry) => entry.relative === "index.html")) {
    throw new HttpError(
      409,
      "Admin 产物根部缺少 index.html：静态托管要求入口文件；若产物在子目录，请在项目配置中填写产物目录",
    );
  }
  return { fileCount: entries.length, totalBytes: total };
}

async function materialize(dir, entries, db) {
  let bytes = 0;
  for (const entry of entries) {
    const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [entry.versionId]);
    if (!row) throw new HttpError(409, `产物版本已不存在：${entry.path}`);
    const target = join(dir, ...entry.relative.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, row.content);
    bytes += row.content?.length || 0;
  }
  return bytes;
}

async function readHostingDomain(manager) {
  try {
    const info = await manager.hosting.getInfo();
    const first = Array.isArray(info) ? info[0] : null;
    return first?.domain || first?.Domain || null;
  } catch {
    return null;
  }
}

/**
 * Deploy the built admin bundle to CloudBase static hosting and record it as a
 * deployment. Returns the deployment id so the approval flow can store it.
 */
export async function deployAdminHosting(service, actor, projectId, request, options = {}) {
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) throw new HttpError(409, "该项目尚未启用小程序全量工作区");
  const adminDeploy = runtime.adminDeploy;
  if (!adminDeploy) throw new HttpError(409, "尚未配置 Admin 发布目标");
  const environment = request.environment || adminDeploy.environment || "development";

  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const adminFiles = snapshot.areas.miniprogram_admin?.files || [];
  const selected = selectHostingFiles(adminFiles, adminDeploy.distDir);
  const payload = assertHostingPayload(selected);

  const cloudPath = normalizeCloudPath(adminDeploy.hostingPath);
  const dir = await mkdtemp(join(tmpdir(), "cothread-hosting-"));
  const log = [];
  try {
    // Resolved inside the try so a credential/config failure is still recorded as a
    // failed deployment instead of vanishing (audit consistency).
    const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
    const bytes = await materialize(dir, selected, service.db);
    log.push(`materialized ${selected.length} files (${bytes} bytes)`);
    const info = await stat(join(dir, "index.html"));
    if (!info.isFile()) throw new HttpError(409, "Admin 产物 index.html 不是文件");

    await manager.hosting.uploadFiles({
      localPath: dir,
      cloudPath: cloudPath || undefined,
      onProgress: (progress) => {
        if (log.length < 500) log.push(JSON.stringify(progress));
      },
    });
    log.push(`uploaded to cloudPath=${cloudPath || "(root)"} env=${envId}`);

    if (adminDeploy.spaFallback) {
      await manager.hosting.setWebsiteDocument({
        indexDocument: "index.html",
        errorDocument: "index.html",
        originalHttpStatus: "Disabled",
        charity404: "Disabled",
      });
      log.push("spa fallback configured (index.html for 404)");
    }

    const domain = await readHostingDomain(manager);
    const url = domain ? `https://${domain}${cloudPath ? `/${cloudPath}/` : "/"}` : null;

    const deploymentId = randomUUID();
    await query(
      service.db,
      `INSERT INTO miniprogram_deployments
         (id,project_id,target,environment,version,url,source_hash,status,log,published_by,published_at,confirmed_by,confirmed_at,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [
        deploymentId,
        projectId,
        request.target || "cloudbase_static",
        environment,
        request.version || null,
        url,
        snapshot.sourceHash,
        "succeeded",
        log.join("\n").slice(0, 60_000),
        actor.id,
        actor.id,
      ],
    );
    return { deploymentId, url, envId, cloudPath, ...payload };
  } catch (error) {
    const detail =
      error instanceof HttpError ? error.message : `Admin 发布失败：${error?.message || error}`;
    await query(
      service.db,
      `INSERT INTO miniprogram_deployments
         (id,project_id,target,environment,version,source_hash,status,log,published_by,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
      [
        randomUUID(),
        projectId,
        request.target || "cloudbase_static",
        environment,
        request.version || null,
        snapshot.sourceHash,
        "failed",
        `${log.join("\n")}\n${detail}`.slice(0, 60_000),
        actor.id,
      ],
    );
    throw error instanceof HttpError ? error : new HttpError(502, detail);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
