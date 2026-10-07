import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, relative, sep, resolve as resolvePath } from "node:path";
import JSZip from "jszip";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { miniprogramSnapshot, miniprogramWorkspaceFolders } from "./miniprogram-workspace.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import {
  injectMiniprogramRuntimeSource,
  resolveMiniprogramRuntime,
  runtimeBuildHash,
} from "./miniprogram-runtime-environment.js";
import { uniqueArtifactTitle, uniqueVersionFilename } from "./project-library.js";

const require = createRequire(import.meta.url);

export const BUILD_KINDS = ["app_preview", "admin_build"];
export const COMPILER_TIMEOUT_MS = Number(process.env.MINIPROGRAM_COMPILE_TIMEOUT_MS || 180000);
export const MAX_BUILD_LOG_BYTES = 64 * 1024;
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

/**
 * The compiler package does not export "./package.json", so derive its root
 * from the resolved entry point and read the manifest from disk instead.
 */
function compilerPackageRoot() {
  return dirname(dirname(require.resolve("@dimina/compiler")));
}

function compilerManifest() {
  try {
    return JSON.parse(readFileSync(join(compilerPackageRoot(), "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Resolve the pinned Dimina compiler CLI shipped with this deployment. */
export function compilerBinPath() {
  const manifest = compilerManifest();
  const bin = typeof manifest?.bin === "string" ? manifest.bin : manifest?.bin?.dmcc;
  if (!bin) throw new HttpError(500, "Dimina 编译器缺少 dmcc 可执行入口");
  return resolvePath(compilerPackageRoot(), bin);
}

export function compilerVersion() {
  return compilerManifest()?.version || null;
}

function truncateLog(value) {
  const text = String(value || "");
  if (Buffer.byteLength(text, "utf8") <= MAX_BUILD_LOG_BYTES) return text;
  return `${text.slice(0, MAX_BUILD_LOG_BYTES)}\n…（日志已截断）`;
}

function safeRelativePath(value) {
  const normalized = String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new HttpError(400, `非法的小程序文件路径：${value}`);
  }
  return normalized;
}

/** Materialize the effective source snapshot into a temp workspace. */
async function materializeSources(db, files, root, runtimeConfig = null) {
  let written = 0;
  for (const file of files) {
    const relativePath = safeRelativePath(file.path);
    const target = join(root, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    const [row] = await query(db, "SELECT content FROM versions WHERE id=?", [file.versionId]);
    if (!row) throw new HttpError(409, `源码版本已不存在：${file.path}`);
    const isEntry = /^(app|game)\.(js|ts)$/i.test(relativePath);
    const content = runtimeConfig && isEntry
      ? injectMiniprogramRuntimeSource(row.content, relativePath, runtimeConfig)
      : row.content;
    await writeFile(target, content);
    written += 1;
  }
  return written;
}

/** Run the Dimina compiler with a hard timeout and bounded output. */
export function runCompiler({ srcDir, outDir, signal }) {
  const bin = compilerBinPath();
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [bin, "build", "-c", srcDir, "-s", outDir, "--no-app-id-dir"],
      {
        cwd: srcDir,
        env: {
          ...process.env,
          DIMINA_COMPILER_MAX_WORKERS: process.env.DIMINA_COMPILER_MAX_WORKERS || "1",
          NODE_OPTIONS: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ code: null, stdout, stderr, timedOut: true });
    }, COMPILER_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < MAX_BUILD_LOG_BYTES * 2) stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < MAX_BUILD_LOG_BYTES * 2) stderr += chunk.toString();
    });
    child.on("error", (error) =>
      finish({ code: null, stdout, stderr: `${stderr}${error.message}`, spawnError: true }),
    );
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut: false }));
    if (signal) {
      if (signal.aborted) {
        try {
          child.kill();
        } catch {}
        finish({ code: null, stdout, stderr, aborted: true });
      } else {
        signal.addEventListener(
          "abort",
          () => {
            try {
              child.kill();
            } catch {}
            finish({ code: null, stdout, stderr, aborted: true });
          },
          { once: true },
        );
      }
    }
  });
}

async function collectFiles(root, base = root, out = []) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) await collectFiles(full, base, out);
    else if (entry.isFile()) out.push({ path: relative(base, full).split(sep).join("/"), full });
  }
  return out;
}

/** Validate a compiled bundle looks like a runnable Dimina resource pack. */
export function validateBundlePaths(paths) {
  const set = new Set(paths);
  if (!set.has("main/app-config.json")) {
    return { ok: false, reason: "编译产物缺少 main/app-config.json" };
  }
  if (![...set].some((path) => path === "main/logic.js")) {
    return { ok: false, reason: "编译产物缺少 main/logic.js" };
  }
  return { ok: true, reason: null };
}

function validateSources(files) {
  const paths = new Set(files.map((file) => file.path));
  if (!paths.size) return { ok: false, reason: "小程序源文件目录为空，请先写入源码" };
  const hasAppJson = paths.has("app.json");
  if (!hasAppJson) return { ok: false, reason: "缺少 app.json" };
  const hasEntry = [...paths].some((path) => /^(app\.(js|ts)|game\.(js|ts))$/.test(path));
  if (!hasEntry) return { ok: false, reason: "缺少 app.js / app.ts 入口文件" };
  return { ok: true, reason: null };
}

async function latestSucceededBuild(db, projectId, kind, sourceHash) {
  const [row] = await query(
    db,
    `SELECT id,source_hash,output_folder_id,output_version_id,runtime_version,created_at,finished_at
     FROM miniprogram_builds
     WHERE project_id=? AND kind=? AND status='succeeded' AND source_hash=?
     ORDER BY finished_at DESC, created_at DESC LIMIT 1`,
    [projectId, kind, sourceHash],
  );
  return row || null;
}

export async function findRunningBuild(db, projectId, kind) {
  const [row] = await query(
    db,
    `SELECT id,status,started_at FROM miniprogram_builds
     WHERE project_id=? AND kind=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`,
    [projectId, kind],
  );
  return row || null;
}

/**
 * Compile the miniprogram source area into the Web resource pack used by the
 * Dimina container, storing the bundle as one immutable version under
 * miniprogram_web and recording a build row for status and logs.
 */
export async function buildMiniprogramPreview(service, actor, projectId, options = {}) {
  const kind = "app_preview";
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  if (!runtime.enabled) throw new HttpError(409, "小程序工作区尚未通过连接测试");
  if (!runtime.appId) throw new HttpError(409, "尚未配置微信小程序 AppID");
  const runtimeConfig = resolveMiniprogramRuntime(runtime, "dimina");

  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const sources = snapshot.areas.miniprogram_source?.files || [];
  const sourceCheck = validateSources(sources);
  if (!sourceCheck.ok) throw new HttpError(409, sourceCheck.reason);
  const buildSourceHash = runtimeBuildHash(snapshot.sourceHash, runtimeConfig);

  const running = await findRunningBuild(service.db, projectId, kind);
  if (running) {
    return { buildId: running.id, status: running.status, reused: true, running: true };
  }

  if (!options.force) {
    const cached = await latestSucceededBuild(service.db, projectId, kind, buildSourceHash);
    if (cached) {
      return { buildId: cached.id, status: "succeeded", reused: true, running: false };
    }
  }

  const { byKind } = await miniprogramWorkspaceFolders(service.db, projectId);
  const webFolderId = byKind.get("miniprogram_web")?.id || null;
  if (!webFolderId) throw new HttpError(409, "小程序 Web 产物目录不存在，请先保存配置");

  const buildId = randomUUID();
  await query(
    service.db,
    `INSERT INTO miniprogram_builds(id,project_id,kind,source_hash,source_snapshot,status,runtime_version,created_by,started_at)
     VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
    [
      buildId,
      projectId,
      kind,
      buildSourceHash,
      JSON.stringify({
        sourceHash: snapshot.sourceHash,
        runtime: runtimeConfig,
        files: sources.map((file) => ({
          path: file.path,
          versionId: file.versionId,
          sha256: file.sha256,
        })),
      }),
      "running",
      compilerVersion(),
      actor.id,
    ],
  );

  const workRoot = await mkdtemp(join(tmpdir(), "cothread-miniprogram-"));
  const srcDir = join(workRoot, "src");
  const outDir = join(workRoot, "out");
  let log = "";
  try {
    await mkdir(srcDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
    const written = await materializeSources(service.db, sources, srcDir, runtimeConfig);
    log += `已写入源码文件 ${written} 个，源码 hash ${snapshot.sourceHash}，CloudBase ${runtimeConfig.environment}/${runtimeConfig.cloudbase.envId}\n`;

    const result = await runCompiler({ srcDir, outDir, signal: options.signal });
    log += `--- dmcc stdout ---\n${result.stdout}\n--- dmcc stderr ---\n${result.stderr}\n`;

    if (result.aborted) {
      await finishBuild(service.db, buildId, "cancelled", log, "cancelled");
      throw new HttpError(499, "构建已取消");
    }
    if (result.timedOut || result.code !== 0) {
      const code = result.timedOut ? "timeout" : "compile_error";
      await finishBuild(service.db, buildId, "failed", log, code);
      throw new HttpError(
        409,
        result.timedOut
          ? `小程序编译超时（${Math.round(COMPILER_TIMEOUT_MS / 1000)} 秒）`
          : "小程序编译失败，请查看构建日志",
      );
    }

    const compiled = await collectFiles(outDir);
    const bundleCheck = validateBundlePaths(compiled.map((file) => file.path));
    if (!bundleCheck.ok) {
      await finishBuild(
        service.db,
        buildId,
        "failed",
        `${log}${bundleCheck.reason}\n`,
        "invalid_bundle",
      );
      throw new HttpError(500, `编译产物不完整：${bundleCheck.reason}`);
    }

    const zip = new JSZip();
    for (const file of compiled) zip.file(file.path, await readFile(file.full));
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    if (bytes.length > MAX_BUNDLE_BYTES) {
      await finishBuild(service.db, buildId, "failed", log, "bundle_too_large");
      throw new HttpError(
        413,
        `编译产物超过 ${Math.round(MAX_BUNDLE_BYTES / 1024 / 1024)} MiB 上限`,
      );
    }

    const published = await publishBundle(service.db, {
      projectId,
      folderId: webFolderId,
      filename: `${runtime.appId}.zip`,
      content: bytes,
      createdBy: actor.id,
      note: `Dimina 编译产物 · ${snapshot.sourceHash.slice(0, 12)} · ${runtimeConfig.environment}`,
    });
    log += `已保存编译产物 ${compiled.length} 个文件，bundle ${bytes.length} 字节\n`;

    await query(
      service.db,
      `UPDATE miniprogram_builds
       SET status='succeeded',log=?,output_folder_id=?,output_version_id=?,finished_at=UTC_TIMESTAMP(3),error_code=NULL
       WHERE id=?`,
      [truncateLog(log), webFolderId, published.versionId, buildId],
    );

    return {
      buildId,
      status: "succeeded",
      reused: false,
      running: false,
      versionId: published.versionId,
      artifactId: published.artifactId,
      fileCount: compiled.length,
      bundleBytes: bytes.length,
      sourceHash: buildSourceHash,
      sourceContentHash: snapshot.sourceHash,
      environment: runtimeConfig.environment,
      envId: runtimeConfig.cloudbase.envId,
    };
  } catch (error) {
    if (error?.status === 499) throw error;
    await finishBuild(
      service.db,
      buildId,
      "failed",
      `${log}${error?.message || error}\n`,
      "internal_error",
    );
    throw error;
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function finishBuild(db, buildId, status, log, errorCode) {
  try {
    await query(
      db,
      `UPDATE miniprogram_builds SET status=?,log=?,error_code=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [status, truncateLog(log), errorCode || null, buildId],
    );
  } catch {}
}

/** Store the compiled bundle as one immutable version in the given folder. */
async function publishBundle(db, { projectId, folderId, filename, content, createdBy, note }) {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const title = await uniqueArtifactTitle(
    db,
    projectId,
    folderId,
    filename.replace(/\.zip$/i, ""),
    null,
    filename,
  );
  const storedName = await uniqueVersionFilename(db, projectId, folderId, filename);
  const artifactId = randomUUID();
  const versionId = randomUUID();
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)",
    [artifactId, projectId, folderId, title, createdBy],
  );
  await query(
    db,
    `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      versionId,
      artifactId,
      null,
      1,
      storedName,
      "application/zip",
      content,
      sha256,
      content.length,
      note || "",
      createdBy,
    ],
  );
  return { artifactId, versionId, sha256, byteSize: content.length };
}

export async function listMiniprogramBuilds(
  service,
  user,
  projectId,
  { kind = "app_preview", limit = 20 } = {},
) {
  await service.member(user, projectId, false);
  const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await query(
    service.db,
    `SELECT id,kind,source_hash,status,output_folder_id,output_version_id,runtime_version,error_code,
       created_by,created_at,started_at,finished_at
     FROM miniprogram_builds WHERE project_id=? AND kind=?
     ORDER BY created_at DESC LIMIT ${size}`,
    [projectId, kind],
  );
  return { builds: rows.map(redactBuild) };
}

export async function readMiniprogramBuild(service, user, projectId, buildId) {
  await service.member(user, projectId, false);
  const [row] = await query(
    service.db,
    `SELECT id,project_id,kind,source_hash,source_snapshot,status,log,output_folder_id,output_version_id,
       runtime_version,error_code,created_by,created_at,started_at,finished_at
     FROM miniprogram_builds WHERE id=?`,
    [buildId],
  );
  if (!row || row.project_id !== projectId) throw new HttpError(404, "构建记录不存在");
  return { ...redactBuild(row), log: row.log || "", sourceSnapshot: row.source_snapshot || null };
}

function redactBuild(row) {
  return {
    id: row.id,
    kind: row.kind,
    sourceHash: row.source_hash || null,
    status: row.status,
    outputFolderId: row.output_folder_id || null,
    outputVersionId: row.output_version_id || null,
    runtimeVersion: row.runtime_version || null,
    errorCode: row.error_code || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
  };
}

/**
 * What the 小程序web预览 tab needs: whether a runnable bundle exists, where the
 * container should look for resources, and which pageFrame to use.
 */
export async function readMiniprogramPreviewMeta(service, user, projectId) {
  await service.member(user, projectId, false);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const runtimeConfig = runtime.cloudbaseEnvs?.development?.envId
    ? resolveMiniprogramRuntime(runtime, "dimina")
    : null;
  const buildSourceHash = runtimeConfig
    ? runtimeBuildHash(snapshot.sourceHash, runtimeConfig)
    : null;
  const [build] = await query(
    service.db,
    `SELECT id,status,source_hash,output_version_id,output_folder_id,error_code,finished_at
     FROM miniprogram_builds WHERE project_id=? AND kind='app_preview'
     ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  );
  const current =
    runtimeConfig && build && build.source_hash === buildSourceHash && build.status === "succeeded";
  return {
    appId: runtime.appId,
    entryPage: runtime.entryPage,
    enabled: runtime.enabled,
    sourceHash: snapshot.sourceHash,
    environment: runtimeConfig?.environment || "development",
    envId: runtimeConfig?.cloudbase.envId || null,
    sourceFileCount: (snapshot.areas.miniprogram_source?.files || []).length,
    build: build ? redactBuild(build) : null,
    runnable: Boolean(current && build?.output_version_id && runtime.appId),
    stale: Boolean(build && (!buildSourceHash || build.source_hash !== buildSourceHash)),
    // Global runtime assets (app-agnostic) and the per-project resource space.
    runtime: {
      moduleUrl: "/dimina/index.js",
      styleUrl: "/dimina/index.css",
      pageFrameUrl: "/dimina/pageFrame.html",
      resourceBaseUrl: `/api/projects/${projectId}/miniprogram/resources/`,
    },
  };
}

/**
 * Serve one file from the stored compiled bundle. The container requests
 * `<resourceBaseUrl><appId>/<path>`, so the appId segment is stripped here.
 */
export async function readMiniprogramResource(service, user, projectId, appId, assetPath) {
  await service.member(user, projectId, false);
  const clean = String(assetPath || "").replace(/^\/+/, "");
  const expected = String(appId || "");
  if (!clean) throw new HttpError(404, "资源不存在");
  const [row] = await query(
    service.db,
    `SELECT v.content FROM miniprogram_builds b
     JOIN versions v ON v.id=b.output_version_id
     WHERE b.project_id=? AND b.kind='app_preview' AND b.status='succeeded'
     ORDER BY b.finished_at DESC, b.created_at DESC LIMIT 1`,
    [projectId],
  );
  if (!row?.content) return null;
  const zip = await JSZip.loadAsync(row.content);
  const entry = zip.file(clean);
  if (!entry) return null;
  const buffer = await entry.async("nodebuffer");
  return { content: buffer, mime: resourceMime(clean) };
}

export function resourceMime(path) {
  const ext = String(path).split(".").pop()?.toLowerCase() || "";
  const table = {
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    html: "text/html; charset=utf-8",
    wxml: "text/plain; charset=utf-8",
    wxss: "text/css; charset=utf-8",
    map: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    wasm: "application/wasm",
  };
  return table[ext] || "application/octet-stream";
}

/** Quick existence probe used by tests and diagnostics. */
export async function bundleEntryCount(content) {
  const zip = await JSZip.loadAsync(content);
  return Object.keys(zip.files).filter((name) => !zip.files[name].dir).length;
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
