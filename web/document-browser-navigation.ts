/**
 * HTML 阅览页的地址解析：把 /api/versions/…/preview 形式的地址映射回库内文档版本。
 * 库数据由 Documents 打包成 ctx 传入。
 */
import type { LibraryFolder, LibraryVersion } from "./document-labels";
import type { BrowserTab } from "./document-view-internals";

export type BrowserNavigationContext = {
  libraryVersions: LibraryVersion[];
  versions: LibraryVersion[];
  libraryFolders: LibraryFolder[];
  browserFileAddress: (item: LibraryVersion) => string;
};

export type BrowserNavigationTarget = {
  href: string;
  versionId: string;
  address: string;
  label: string;
};

export function resolveBrowserNavigation(
  href: string,
  tab: BrowserTab,
  ctx: BrowserNavigationContext,
): BrowserNavigationTarget {
  const { libraryVersions, versions, libraryFolders, browserFileAddress } = ctx;
  let parsed: URL;
  try {
    parsed = new URL(href, window.location.href);
  } catch {
    return { href, versionId: tab.versionId, address: href, label: tab.label };
  }
  const match = parsed.pathname.match(/^\/api\/versions\/([^/]+)\/preview(?:\/(.*))?$/);
  if (!match) {
    const pathname =
      parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname || "新页面";
    return { href: parsed.href, versionId: tab.versionId, address: parsed.href, label: pathname };
  }
  const root =
    libraryVersions.find((item) => item.id === match[1]) ||
    versions.find((item) => item.id === match[1]);
  if (!root)
    return { href: parsed.href, versionId: tab.versionId, address: parsed.href, label: tab.label };
  let assetPath = decodeURIComponent(match[2] || "").replace(
    /^~t~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/?/,
    "",
  );
  if (!assetPath) {
    return {
      href: parsed.href,
      versionId: root.id,
      address: `${browserFileAddress(root)}${parsed.hash}`,
      label: root.filename,
    };
  }
  const rootName = String(root.filename || "").replace(/\\/g, "/");
  const rootDir = rootName.includes("/") ? rootName.slice(0, rootName.lastIndexOf("/")) : "";
  const parts = [...rootDir.split("/"), ...assetPath.split("/")].filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  const relativePath = normalized.join("/");
  const rootFolderId = root.folder_id;
  const folderRelativePath = (folderId: string | null | undefined) => {
    const names: string[] = [];
    let current = libraryFolders.find((folder) => folder.id === folderId) || null;
    while (current && current.id !== rootFolderId) {
      names.unshift(current.name);
      current = libraryFolders.find((folder) => folder.id === current?.parent_id) || null;
    }
    return current?.id === rootFolderId ? names.join("/") : null;
  };
  const target =
    libraryVersions.find((item) => {
      const folderPath = folderRelativePath(item.folder_id);
      const candidate = folderPath ? `${folderPath}/${item.filename}` : item.filename;
      return candidate === relativePath || item.filename === relativePath;
    }) ||
    libraryVersions.find(
      (item) =>
        item.folder_id === rootFolderId && item.filename === normalized[normalized.length - 1],
    );
  if (!target) {
    const displayPath = `${browserFileAddress(root)} / ${relativePath}${parsed.hash}`;
    return {
      href: parsed.href,
      versionId: tab.versionId,
      address: displayPath,
      label: normalized[normalized.length - 1] || tab.label,
    };
  }
  return {
    href: parsed.href,
    versionId: target.id,
    address: `${browserFileAddress(target)}${parsed.hash}`,
    label: target.filename,
  };
}
