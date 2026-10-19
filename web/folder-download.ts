/**
 * 文件夹压缩包下载：流式读取并回报进度，完成后触发浏览器保存。
 * 依赖由 Documents 打包成 ctx 传入。
 */
import type { Dispatch, SetStateAction } from "react";
import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import type { LibraryFolder } from "./document-labels";
import { showTip } from "./Tip";

export type FolderDownloadContext = {
  projectId: string;
  downloadingFolderId: string | null;
  setDownloadingFolderId: Dispatch<SetStateAction<string | null>>;
  setDownloadProgress: Dispatch<SetStateAction<number | null>>;
  setActionError: Dispatch<SetStateAction<string>>;
};

export async function downloadFolderArchive(
  folder: LibraryFolder,
  ctx: FolderDownloadContext,
): Promise<void> {
  const {
    projectId,
    downloadingFolderId,
    setDownloadingFolderId,
    setDownloadProgress,
    setActionError,
  } = ctx;
  if (downloadingFolderId) return;
  setDownloadingFolderId(folder.id);
  setDownloadProgress(0);
  setActionError("");
  try {
    const response = await apiFetch(`/api/projects/${projectId}/folders/${folder.id}/download`);
    if (!response.ok) {
      const body = await readJsonResponse(response, "文件夹压缩包下载").catch(() => null);
      throw new Error(body?.error || `下载失败（${response.status}）`);
    }
    if (!response.body) throw new Error("下载失败：浏览器不支持读取下载进度");
    const total = Number(response.headers.get("Content-Length")) || 0;
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      const chunk = part.value.slice();
      chunks.push(chunk.buffer as ArrayBuffer);
      received += part.value.length;
      if (total) setDownloadProgress(Math.min(99, Math.round((received / total) * 100)));
    }
    const blob = new Blob(chunks, { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folder.name || "文件夹"}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDownloadProgress(100);
    showTip("压缩包已开始下载");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "压缩包下载失败";
    setActionError(detail);
    showTip(detail, "error");
  } finally {
    window.setTimeout(() => {
      setDownloadingFolderId(null);
      setDownloadProgress(null);
    }, 400);
  }
}
