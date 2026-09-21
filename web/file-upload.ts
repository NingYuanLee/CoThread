import { readJsonResponse } from "../shared/json-response.js";
import { INLINE_FILE_MAX_BYTES, FILE_MAX_BYTES, webFileChunkSize } from "../shared/upload-limits.js";
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

type UploadedVersion = {
  id: string;
  artifactId: string;
  sha256: string;
  byteSize: number;
  title: string;
  filename: string;
  mime?: string;
};

async function pollOfficialUpload(projectId: unknown, sha256: string, filename: string) {
  for (let step = 0; step < 40; step++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const found = await findOfficialUpload(projectId, sha256, filename).catch(() => null);
    if (found) return found;
  }
  return new Promise<UploadedVersion>(() => {});
}

async function findOfficialUpload(projectId: unknown, sha256: string, filename: string) {
  const response = await apiFetch(`/api/projects/${projectId}/library`);
  const library = await readJsonResponse(response, `/api/projects/${projectId}/library`) as {
    versions?: Array<{ id: string; artifactId: string; sha256: string; byte_size?: number; title: string; filename: string; mime?: string; deleted_at?: string | null }>;
  };
  const found = library.versions?.find((row) =>
    !row.deleted_at && (row.sha256 === sha256 || row.filename === filename));
  if (!found) return null;
  return {
    id: found.id,
    artifactId: found.artifactId,
    sha256: found.sha256,
    byteSize: Number(found.byte_size || 0),
    title: found.title,
    filename: found.filename,
    mime: found.mime,
  } as UploadedVersion;
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
  const title = String(init.title || file.name.replace(/\.[^.]+$/, "") || file.name);
  const payload = {
    title,
    filename: file.name,
    mime: file.type || "application/octet-stream",
    contentBase64: toBase64(bytes),
    sha256,
  };
  try {
    if (init.kind === "official_file" && file.size <= INLINE_FILE_MAX_BYTES) {
      progress?.(30);
      const posted = apiFetch(`/api/projects/${init.projectId}/documents/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: init.folderId,
          ...payload,
        }),
      }).then((response) => readJsonResponse(response, `/api/projects/${init.projectId}/documents/upload`));
      const completed = await Promise.race([
        posted,
        pollOfficialUpload(init.projectId, sha256, file.name),
      ]);
      progress?.(100);
      return completed as UploadedVersion;
    }
    const started = await readJsonResponse(
      await apiFetch("/api/file-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...init,
          title,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          byteSize: file.size,
          sha256,
          chunkSize: webFileChunkSize(file.size),
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
    return completed as UploadedVersion;
  } catch (error) {
    if (init.kind === "official_file") {
      const saved = await findOfficialUpload(init.projectId, sha256, file.name).catch(() => null);
      if (saved) {
        progress?.(100);
        return saved;
      }
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
      throw new Error(`${file.name} 上传超时，请重试`);
    throw error;
  }
}
