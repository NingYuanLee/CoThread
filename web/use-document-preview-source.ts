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
          const entry = {
            kind,
            bytes,
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
