/**
 * 预览派生文件的编排：判断是否需要转换、单飞执行、写回内核存储。
 *
 * 只有单个 Node 进程（ECS 单实例）在内存里做单飞；跨进程/重启由
 * `claimRendition` 的尝试次数与状态收敛，不会无限重试。转换在后台进行，
 * 首次请求返回 pending，前端短轮询后再取。
 */
import { createHash } from "node:crypto";
import {
  claimRendition,
  completeRendition,
  failRendition,
  getRendition,
  RENDITION_MAX_ATTEMPTS,
} from "./documents/index.js";
import { convertToOoxml, planOfficeRendition } from "./office-convert.ts";
import type { RenditionRow } from "./documents/index.js";
import type { Db } from "./types.ts";

/** 确保派生文件的结果；调用方按 `status` 决定响应码。 */
export type RenditionOutcome =
  | {
      status: "ready";
      kind: string;
      filename: string | null;
      mime: string | null;
      content: Buffer;
      reason: string;
    }
  | { status: "pending" }
  | { status: "unsupported"; reason: string }
  | { status: "failed"; reason: string };

/** 待转换的版本：至少需要定位、源哈希、文件名与原始字节。 */
export type RenditionVersion = {
  id: string;
  sha256: string;
  filename: string;
  content: Buffer;
};

const inflight = new Set<string>();

function digest(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readyResult(row: RenditionRow): RenditionOutcome {
  return {
    status: "ready",
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    content: row.content as Buffer,
    reason: "",
  };
}

/**
 * 确保派生文件可用。
 * - ready：返回字节，调用方直接响应；
 * - pending：已开始后台转换，调用方返回 202；
 * - unsupported / failed：返回原因，调用方回退到下载或错误提示。
 *
 * `existing` 可传入调用方已查到的记录，避免重复查询。
 */
export async function ensureOfficeRendition({
  db,
  version,
  existing = null,
}: {
  db: Db;
  version: RenditionVersion;
  existing?: RenditionRow | null;
}): Promise<RenditionOutcome> {
  const versionId = version.id;
  const sourceSha256 = version.sha256;
  const record = existing || (await getRendition(db, versionId, { withContent: true }));
  const fresh = record && record.source_sha256 === sourceSha256;
  if (fresh && record.status === "ready" && record.content) return readyResult(record);

  // office-convert.js 尚未转换；这里写明它「supported 为真」时的返回契约。
  const plan = planOfficeRendition(version.filename, version.content) as {
    supported: boolean;
    reason: string;
    kind: string;
    inputExtension: string;
    filename: string;
    mime: string;
  };
  if (!plan.supported) return { status: "unsupported", reason: plan.reason };
  if (inflight.has(versionId)) return { status: "pending" };
  if (fresh && record.status === "failed" && Number(record.attempts) >= RENDITION_MAX_ATTEMPTS)
    return { status: "failed", reason: record.error || "转换多次失败，可稍后重试。" };

  const claimed = await claimRendition(db, {
    versionId,
    kind: plan.kind,
    sourceSha256,
    filename: plan.filename,
    mime: plan.mime,
  });
  if (claimed && claimed.source_sha256 === sourceSha256 && claimed.status === "ready") {
    const row = await getRendition(db, versionId, { withContent: true });
    if (row?.content) return readyResult(row);
  }
  if (claimed && Number(claimed.attempts) > RENDITION_MAX_ATTEMPTS)
    return { status: "failed", reason: claimed.error || "转换多次失败，可稍后重试。" };

  inflight.add(versionId);
  void (async () => {
    try {
      const converted = await convertToOoxml({ content: version.content, plan });
      await completeRendition(db, {
        versionId,
        sourceSha256,
        content: converted.content,
        sha256: digest(converted.content),
        byteSize: converted.content.length,
        filename: converted.filename,
        mime: converted.mime,
      });
    } catch (error) {
      await failRendition(db, {
        versionId,
        sourceSha256,
        error: (error as Error | undefined)?.message || "转换失败",
      }).catch(() => {});
    } finally {
      inflight.delete(versionId);
    }
  })();
  return { status: "pending" };
}
