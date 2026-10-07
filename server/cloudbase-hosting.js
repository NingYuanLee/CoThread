import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import { miniprogramSnapshot } from "./miniprogram-workspace.js";
import { getCloudbaseManager } from "./cloudbase.js";
import {
  injectAdminRuntimeHtml,
  resolveMiniprogramRuntime,
} from "./miniprogram-runtime-environment.js";

/**
 * PC 管理后台的 CloudBase 静态托管发布。
 *
 * Admin 工作区本身就是可发布根目录。服务端只做「物化 → 上传 → 记录」，
 * 不执行构建命令，也不再约定额外的 dist 目录。
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

/** Select the whole Admin workspace; it is the static site's upload root. */
export function selectHostingFiles(files) {
  return files
    .map((file) => ({ ...file, relative: String(file.path || "").replace(/^\/+/, "") }))
    .filter((file) => file.relative);
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
    throw new HttpError(409, "Admin 根目录缺少 index.html：静态网站托管要求入口文件");
  }
  return { fileCount: entries.length, totalBytes: total };
}

async function materialize(dir, entries, db, runtimeConfig) {
  let bytes = 0;
  for (const entry of entries) {
    const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [entry.versionId]);
    if (!row) throw new HttpError(409, `产物版本已不存在：${entry.path}`);
    const target = join(dir, ...entry.relative.split("/"));
    await mkdir(dirname(target), { recursive: true });
    const content =
      entry.relative === "index.html"
        ? injectAdminRuntimeHtml(row.content, runtimeConfig)
        : row.content;
    await writeFile(target, content);
    bytes += content?.length || 0;
  }
  return bytes;
}

async function readHostingDomain(manager) {
  try {
    const info = await manager.hosting.getInfo();
    const first = Array.isArray(info) ? info[0] : null;
    if (!first) return null;
    // 实测 getInfo() 返回的字段是 `CdnDomain`（同结构里还有 Bucket/Region/Status）。
    // 早期只读 domain/Domain 会得到 null，发布记录里因此没有可访问地址。
    return first.CdnDomain || first.cdnDomain || first.domain || first.Domain || null;
  } catch {
    return null;
  }
}

function hostingUrl(domain, cloudPath) {
  const value = String(domain || "").trim();
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const prefix = parsed.pathname.replace(/\/+$/, "");
  const suffix = cloudPath ? `/${cloudPath}/` : "/";
  parsed.pathname = `${prefix}${suffix}`.replace(/\/{2,}/g, "/");
  return parsed.href;
}

/** Resolve the current Admin address even when an older deployment row has no URL. */
export async function readAdminProductionUrl(service, user, projectId) {
  await service.member(user, projectId, false);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const adminDeploy = runtime.adminDeploy;
  if (!adminDeploy) return { environment: "production", url: null };
  const cloudPath = normalizeCloudPath(adminDeploy.hostingPath);
  const customUrl = hostingUrl(adminDeploy.customDomain, cloudPath);
  if (customUrl) return { environment: "production", url: customUrl };
  if (!runtime.cloudbaseEnvs?.production?.envId && !runtime.cloudbaseEnvs?.development?.envId) {
    return { environment: "production", url: null };
  }
  const { manager } = await getCloudbaseManager(service, projectId, "production");
  const domain = await readHostingDomain(manager);
  return { environment: "production", url: hostingUrl(domain, cloudPath) };
}

/**
 * Deploy the built admin bundle to CloudBase static hosting and record it as a
 * deployment. Returns the deployment id so the approval flow can store it.
 */
export async function deployAdminHosting(service, actor, projectId, request, options = {}) {
  if (request?.target && request.target !== "cloudbase_static") {
    throw new HttpError(400, "Admin 仅支持静态网站托管");
  }
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) throw new HttpError(409, "小程序工作区尚未通过连接测试");
  const adminDeploy = runtime.adminDeploy;
  if (!adminDeploy) throw new HttpError(409, "尚未配置 Admin 生产版");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "admin_publish");
  const environment = runtimeConfig.environment;

  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const adminFiles = snapshot.areas.miniprogram_admin?.files || [];
  const selected = selectHostingFiles(adminFiles);
  const payload = assertHostingPayload(selected);

  const cloudPath = normalizeCloudPath(adminDeploy.hostingPath);
  const dir = await mkdtemp(join(tmpdir(), "cothread-hosting-"));
  const log = [];
  try {
    // Resolved inside the try so a credential/config failure is still recorded as a
    // failed deployment instead of vanishing (audit consistency).
    const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
    const bytes = await materialize(dir, selected, service.db, runtimeConfig);
    log.push(`materialized ${selected.length} files (${bytes} bytes)`);
    const info = await stat(join(dir, "index.html"));
    if (!info.isFile()) throw new HttpError(409, "Admin 根目录的 index.html 不是文件");

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
    const url = hostingUrl(domain, cloudPath);

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
    return { deploymentId, url, envId, environment, cloudPath, ...payload };
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
