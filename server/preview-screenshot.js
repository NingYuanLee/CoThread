import { chromium } from "playwright";
import { posix } from "node:path";
import { inlineHtmlPreviewAssets } from "../shared/html-preview.mjs";
import { previewContentType, storedContentType } from "./preview-mime.js";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./project-library.js";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function imageData(content, mime) {
  return `data:${mime};base64,${Buffer.from(content).toString("base64")}`;
}

function latestVersions(versions) {
  const current = new Map();
  for (const version of versions) {
    const previous = current.get(version.artifact_id || version.artifactId);
    if (!previous || Number(version.version) > Number(previous.version))
      current.set(version.artifact_id || version.artifactId, version);
  }
  return [...current.values()];
}

function treeMarkup(project) {
  const folders = filterProjectLibraryFolders(project.folders || []);
  const versions = latestVersions(filterProjectLibraryVersions(project.versions || []));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map();
  for (const folder of folders) {
    const key = folder.parent_id || "root";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(folder);
  }
  for (const list of children.values()) list.sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-CN"));
  const filesByFolder = new Map();
  for (const version of versions) {
    const key = version.folder_id || "root";
    if (!filesByFolder.has(key)) filesByFolder.set(key, []);
    filesByFolder.get(key).push(version);
  }
  for (const list of filesByFolder.values()) list.sort((a, b) => String(a.filename).localeCompare(String(b.filename), "zh-CN"));
  const renderFolder = (folderId, depth = 0) => {
    const rows = [];
    for (const folder of children.get(folderId) || []) {
      rows.push(`<li class="folder"><span class="folder-icon">▾</span><span>${escapeHtml(folder.name)}</span>`);
      rows.push(`<ul>${renderFolder(folder.id, depth + 1)}</ul></li>`);
    }
    for (const version of filesByFolder.get(folderId) || []) {
      rows.push(`<li class="file"><span class="file-icon">▤</span><span>${escapeHtml(version.filename || version.title)}</span><small>v${escapeHtml(version.version)}</small></li>`);
    }
    return rows.join("");
  };
  return `<ul class="tree">${renderFolder("root") || '<li class="empty">暂无文档</li>'}</ul>`;
}

function treeHtml(project) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#26352c;font-family:Arial,"Microsoft YaHei",sans-serif}
    .shell{width:100%;min-height:100vh;padding:28px 34px;background:#fff}.title{font-size:24px;font-weight:700;margin-bottom:6px}
    .meta{color:#6c786f;font-size:13px;margin-bottom:24px}.tree{list-style:none;margin:0;padding:0 0 0 4px}.tree ul{list-style:none;margin:4px 0 4px 25px;padding:0;border-left:1px solid #d9e0d8}
    li{min-height:34px;display:flex;align-items:center;gap:9px;padding:5px 12px;border-radius:4px;font-size:15px}li.folder{font-weight:600;background:#f7faf6;margin:3px 0}
    li.file{font-weight:400}.folder-icon,.file-icon{width:18px;color:#54765d}.file small{margin-left:auto;color:#8a958c;font-size:12px}.empty{color:#8a958c;padding:12px}
  </style></head><body><main class="shell"><div class="title">${escapeHtml(project.name || "项目文档树")}</div><div class="meta">项目文档树 · ${new Date().toLocaleString("zh-CN")}</div>${treeMarkup(project)}</main></body></html>`;
}

export async function captureProjectTree(project) {
  return captureHtml(treeHtml(project));
}

async function withBrowser(work) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  try {
    return await work(browser);
  } finally {
    await browser.close();
  }
}

async function captureHtml(html, { waitMs = 300, fullPage = true } = {}) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: DEFAULT_VIEWPORT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
    if (waitMs) await page.waitForTimeout(waitMs);
    const image = await page.screenshot({ type: "png", fullPage });
    if (image.length > MAX_SCREENSHOT_BYTES) throw new Error("截图超过 4 MiB");
    return image;
  });
}

async function captureSandboxHtml(sandbox, root, relativePath) {
  const entry = String(relativePath || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!/\.html?$/i.test(entry)) throw new Error("只能截图 HTML 沙箱文件");
  return withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: DEFAULT_VIEWPORT, deviceScaleFactor: 1 });
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.hostname !== "cothread.local") return route.abort();
      const requested = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      if (!requested || requested.includes("..")) return route.abort();
      try {
        const path = `${root}/${requested}`;
        const raw = sandbox.readFile
          ? await sandbox.readFile(path)
          : await sandbox.files.read(path);
        const content = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        await route.fulfill({ body: content, contentType: storedContentType(posix.basename(requested)).split(";")[0] });
      } catch {
        await route.abort();
      }
    });
    await page.goto(`http://cothread.local/${entry}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(500);
    const image = await page.screenshot({ type: "png", fullPage: true });
    if (image.length > MAX_SCREENSHOT_BYTES) throw new Error("截图超过 4 MiB");
    return image;
  });
}

export async function captureDocumentTree(service, user, projectId) {
  const project = await service.project(user, projectId);
  return { content: await captureProjectTree(project), mime: "image/png", filename: "document-tree.png", source: "document_tree" };
}

export async function captureDocumentPreview(service, user, versionId) {
  const version = await service.version(user, versionId);
  const filename = String(version.filename || "文档");
  let html;
  if (/\.html?$/i.test(filename)) {
    const preview = await service.versionPreview(user, versionId, "");
    html = await inlineHtmlPreviewAssets(preview.content.toString("utf8"), async (asset) => {
      const loaded = await service.versionPreview(user, versionId, asset);
      return loaded.content.toString("utf8");
    });
  } else if (/^image\//.test(version.mime || "") || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
    html = `<img style="max-width:100%;display:block;margin:auto" src="${imageData(version.content, previewContentType(version.mime, filename).split(";")[0])}" alt="${escapeHtml(filename)}">`;
  } else {
    html = `<pre style="white-space:pre-wrap;font:14px/1.6 Consolas,monospace;padding:24px">${escapeHtml(version.content.toString("utf8"))}</pre>`;
  }
  return { content: await captureHtml(`<!doctype html><html><body style="margin:0;background:#fff">${html}</body></html>`), mime: "image/png", filename: `${filename}.preview.png`, source: "document_preview", versionId };
}

export async function captureSandboxPreview(sandbox, root, path) {
  return { content: await captureSandboxHtml(sandbox, root, path), mime: "image/png", filename: `${posix.basename(path)}.preview.png`, source: "sandbox_html", path };
}
