/**
 * 文档预览内容加载：按扩展名拉取元数据与内容，写入视图缓存并产出预览状态。
 * 依赖由 Documents 打包成 ctx 传入。
 */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "./api-fetch";
import { readJsonResponse } from "../shared/json-response.js";
import type { ImagePreviewSource } from "./ImagePreview";
import {
  TEXT_PREVIEW_NAME,
  documentViewCache,
  readVersionText,
  type DocumentViewCacheEntry,
} from "./document-view-internals";

export type DocumentViewState = {
  text?: string;
  url?: string;
  bytes?: Uint8Array;
  kind: string;
  mime: string;
  truncated?: boolean;
  byteSize?: number;
  nativeSource?: boolean;
};

export type DocumentPreviewSourceContext = {
  selected: string;
  previewReload: number;
  setView: Dispatch<SetStateAction<DocumentViewState | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setImagePreview: Dispatch<SetStateAction<ImagePreviewSource | null>>;
  setFileInfoOpen: Dispatch<SetStateAction<boolean>>;
};

const RENDITION_KIND_BY_EXTENSION: Record<string, "docx" | "xlsx" | "pptx"> = {
  doc: "docx",
  xls: "xlsx",
  ppt: "pptx",
};
const RENDITION_MIME_BY_KIND: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** OLE2 复合文档头：旧版二进制 Office 或 WPS 改名成 .docx 的文件。 */
function isCompoundFile(bytes: Uint8Array) {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/**
 * 取服务端派生出的 OOXML：转换在后台进行，202 时短轮询；415/422 表示无法转换。
 * 返回 pending 时前端展示「正在转换」而不是失败的预览。
 */
async function fetchRendition(
  versionId: string,
  isAlive: () => boolean,
): Promise<
  { status: "ready"; bytes: Uint8Array<ArrayBuffer> } | { status: "pending" | "unavailable" }
> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await apiFetch(`/api/versions/${versionId}/rendition`);
    if (!isAlive()) return { status: "unavailable" };
    if (response.ok)
      return { status: "ready", bytes: new Uint8Array(await response.arrayBuffer()) };
    if (response.status !== 202) return { status: "unavailable" };
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!isAlive()) return { status: "unavailable" };
  }
  return { status: "pending" };
}

export function useDocumentPreviewSource(ctx: DocumentPreviewSourceContext) {
  const { selected, previewReload, setView, setError, setImagePreview, setFileInfoOpen } = ctx;
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    const cached = selected ? documentViewCache.get(selected) : undefined;
    const publishCached = (entry: DocumentViewCacheEntry) => {
      if (entry.kind === "image" && entry.bytes) {
        const buffer = entry.bytes.buffer.slice(
          entry.bytes.byteOffset,
          entry.bytes.byteOffset + entry.bytes.byteLength,
        ) as ArrayBuffer;
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: entry.mime }));
        setView({ kind: "image", url: objectUrl, mime: entry.mime });
      } else {
        setView({ ...entry });
      }
    };
    if (!cached) setView(null);
    setError("");
    setImagePreview(null);
    setFileInfoOpen(false);
    if (!selected)
      return () => {
        alive = false;
      };
    if (cached) {
      publishCached(cached);
      return () => {
        alive = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
    const load = async () => {
      const metadataResponse = await apiFetch(`/api/versions/${selected}?metadata=1`);
      const metadata = await readJsonResponse(
        metadataResponse,
        `/api/versions/${selected}?metadata=1`,
      );
      const name = String(metadata.filename || "").toLowerCase();
      if (!alive) return;
      if (name.endsWith(".pdf")) {
        const response = await apiFetch(`/api/versions/${selected}/preview-data`);
        const value = await readJsonResponse(response, `/api/versions/${selected}/preview-data`);
        const bytes = Uint8Array.from(atob(value.contentBase64), (c) => c.charCodeAt(0));
        const entry = {
          kind: "pdf",
          bytes,
          mime: "application/pdf",
        } satisfies DocumentViewCacheEntry;
        documentViewCache.update(selected, () => entry);
        setView(entry);
        return;
      }
      if (name.endsWith(".html") || name.endsWith(".htm")) {
        const entry = {
          kind: "html",
          mime: String(metadata.mime || "text/html"),
          byteSize: Number(metadata.byte_size) || 0,
        } satisfies DocumentViewCacheEntry;
        documentViewCache.update(selected, () => entry);
        setView(entry);
        return;
      }
      const imageMime: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      };
      const extension = name.split(".").pop() || "";
      const mime = String(metadata.mime || "");
      const directRenditionKind = RENDITION_KIND_BY_EXTENSION[extension];
      if (directRenditionKind) {
        const rendition = await fetchRendition(selected, () => alive);
        if (!alive) return;
        if (rendition.status === "ready") {
          const entry = {
            kind: directRenditionKind,
            bytes: rendition.bytes,
            mime: RENDITION_MIME_BY_KIND[directRenditionKind],
          } satisfies DocumentViewCacheEntry;
          documentViewCache.update(selected, () => entry);
          setView(entry);
          return;
        }
        setView({
          kind: rendition.status === "pending" ? "converting" : "download",
          mime: mime || "application/octet-stream",
        });
        return;
      }
      if (
        imageMime[extension] ||
        name.endsWith(".docx") ||
        name.endsWith(".xlsx") ||
        name.endsWith(".csv") ||
        name.endsWith(".pptx")
      ) {
        const response = await apiFetch(`/api/versions/${selected}`);
        const v = await readJsonResponse(response, `/api/versions/${selected}`);
        if (!alive) return;
        const bytes = Uint8Array.from(atob(v.contentBase64), (c) => c.charCodeAt(0));
        if (imageMime[extension]) {
          const entry = {
            kind: "image",
            bytes,
            mime: imageMime[extension],
          } satisfies DocumentViewCacheEntry;
          documentViewCache.update(selected, () => entry);
          publishCached(entry);
        } else {
          const kind = name.endsWith(".docx")
            ? "docx"
            : name.endsWith(".xlsx") || name.endsWith(".csv")
              ? "xlsx"
              : "pptx";
          let renditionBytes = bytes;
          if (isCompoundFile(bytes)) {
            const rendition = await fetchRendition(selected, () => alive);
            if (!alive) return;
            if (rendition.status === "ready") renditionBytes = rendition.bytes;
            else if (rendition.status === "pending") {
              setView({ kind: "converting", mime: mime || "application/octet-stream" });
              return;
            }
          }
          const entry = {
            kind,
            bytes: renditionBytes,
            mime: String(v.mime || mime || "application/octet-stream"),
          } satisfies DocumentViewCacheEntry;
          documentViewCache.update(selected, () => entry);
          setView(entry);
        }
        return;
      }
      if (mime.startsWith("text/") || TEXT_PREVIEW_NAME.test(name)) {
        const loaded = await readVersionText(selected, Number(metadata.byte_size) || 0);
        if (!alive) return;
        const entry = {
          kind: name.endsWith(".md") || name.endsWith(".markdown") ? "markdown" : "text",
          text: loaded.text,
          mime: mime || "text/plain",
          truncated: loaded.truncated,
          byteSize: loaded.byteSize,
        } satisfies DocumentViewCacheEntry;
        documentViewCache.update(selected, () => entry);
        setView(entry);
        return;
      }
      const entry = {
        kind: "download",
        mime: mime || "application/octet-stream",
      } satisfies DocumentViewCacheEntry;
      documentViewCache.update(selected, () => entry);
      setView(entry);
    };
    load().catch((e) => {
      if (alive) setError(e.message);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected, previewReload]);
}
