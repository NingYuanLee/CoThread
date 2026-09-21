import { readJsonResponse } from "../shared/json-response.js";
import { FILE_CHUNK_SIZE, FILE_MAX_BYTES } from "../shared/upload-limits.js";
import { apiFetch } from "./api-fetch";

export async function sha256Hex(data: BufferSource) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function uploadFileWithIntegrity(
  init: Record<string, unknown>,
  file: File,
  progress?: (percent: number) => void,
) {
  if (file.size > FILE_MAX_BYTES)
    throw new Error(`${file.name} 超过单文件 ${FILE_MAX_BYTES / 1024 / 1024} MiB 上限`);
  if (file.size < 1) throw new Error(`${file.name} 是空文件`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const started = await readJsonResponse(
    await apiFetch("/api/file-uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...init,
        title: init.title || file.name.replace(/\.[^.]+$/, "") || file.name,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256,
        chunkSize: FILE_CHUNK_SIZE,
      }),
    }),
    "/api/file-uploads",
  ) as { uploadId: string; chunkSize: number; chunkCount: number };
  for (let index = 0; index < started.chunkCount; index++) {
    const start = index * started.chunkSize;
    const chunk = bytes.subarray(start, start + started.chunkSize);
    const response = await apiFetch(`/api/file-uploads/${started.uploadId}/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        index,
        contentBase64: toBase64(chunk),
        sha256: await sha256Hex(chunk),
      }),
    });
    await readJsonResponse(response, `/api/file-uploads/${started.uploadId}/chunks`);
    progress?.(Math.round(((index + 1) / started.chunkCount) * 95));
  }
  const completed = await readJsonResponse(
    await apiFetch(`/api/file-uploads/${started.uploadId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256 }),
    }),
    `/api/file-uploads/${started.uploadId}/complete`,
  );
  progress?.(100);
  return completed as {
    id: string;
    artifactId: string;
    sha256: string;
    byteSize: number;
    title: string;
    filename: string;
    mime?: string;
  };
}
