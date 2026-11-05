import { randomUUID, createHash } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.ts";
import { HttpError } from "./http-error.ts";
import { captureDocumentRevision, canReadHistoricalSources } from "./memory-history.js";
import type { Db } from "./types.ts";

/** 一组行。 */
type Row = Record<string, unknown>;

/** JSON 列可能是字符串也可能是已解析结构。 */
const parse = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

/** 创建任务时记录的依据来源。 */
export type TaskDecisionInput = {
  projectId: string;
  memoryRevisionIds?: unknown;
  sourceMessageId?: string | null;
  createdByType?: string | null;
  createdById?: string | null;
  title?: unknown;
  goal?: unknown;
  constraints?: unknown;
  sourceTaskId?: string | null;
  folderRefs?: unknown;
};

/** Only caller-declared memory is a decision basis. Merely retrieved material is never attached. */
export async function recordTaskCreationDecision(
  db: Db,
  input: TaskDecisionInput,
  taskId: string,
  documentRefs: string[],
): Promise<string> {
  const basis: Row[] = [];
  for (const id of [
    ...new Set(
      z
        .array(z.string().uuid())
        .max(30)
        .parse(input.memoryRevisionIds || []),
    ),
  ]) {
    const [revision] = await query<{
      id: string;
      pageId: string;
      title?: unknown;
      sources?: unknown;
    }>(
      db,
      "SELECT id,page_id pageId,title,sources FROM memory_page_revisions WHERE id=? AND project_id=?",
      [id, input.projectId],
    );
    if (
      !revision ||
      !(await canReadHistoricalSources(db, input.projectId, parse(revision.sources) || []))
    )
      throw new HttpError(403, "任务的记忆依据不存在、跨项目或已不可访问");
    basis.push({
      kind: "memory_page",
      id: revision.pageId,
      memoryRevisionId: id,
      title: revision.title,
      role: "declared_basis",
      frozenSources: parse(revision.sources) || [],
    });
  }
  if (input.sourceMessageId) {
    const [message] = await query<{
      id: string;
      body: string;
      authorId?: string;
      occurredAt?: unknown;
    }>(
      db,
      "SELECT m.id,m.body,m.author_id authorId,m.created_at occurredAt FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.project_id=? AND m.id=? FOR SHARE",
      [input.projectId, input.sourceMessageId],
    );
    if (!message) throw new HttpError(400, "任务来源消息不属于当前项目");
    basis.push({
      kind: "message",
      ...message,
      role: "request",
      sha256: createHash("sha256").update(message.body).digest("hex"),
    });
  }
  for (const versionId of documentRefs) {
    const contentRevisionId = await captureDocumentRevision(db, input.projectId, versionId);
    if (contentRevisionId)
      basis.push({
        kind: "document_version",
        id: versionId,
        contentRevisionId,
        role: "attached_document",
      });
  }
  const id = randomUUID();
  await query(
    db,
    "INSERT INTO task_decision_records(id,project_id,task_id,action,actor_type,actor_id,decision_json,basis_json) VALUES(?,?,?,'created',?,?,?,?)",
    [
      id,
      input.projectId,
      taskId,
      input.createdByType,
      input.createdById || null,
      JSON.stringify({
        title: input.title,
        goal: input.goal,
        constraints: input.constraints || null,
        sourceTaskId: input.sourceTaskId || null,
        folderRefs: input.folderRefs || [],
      }),
      JSON.stringify(basis),
    ],
  );
  return id;
}

export async function readTaskDecisionEvidence(
  db: Db,
  projectId: string,
  taskId: string,
): Promise<Row[]> {
  const rows = await query<Row>(
    db,
    "SELECT id,action,actor_type actorType,actor_id actorId,decision_json decision,basis_json basis,created_at createdAt FROM task_decision_records WHERE project_id=? AND task_id=? ORDER BY created_at,id",
    [projectId, taskId],
  );
  for (const row of rows) {
    row.decision = parse(row.decision);
    row.basis = await Promise.all(
      ((parse(row.basis) || []) as Row[]).map(async (item) =>
        (await canReadHistoricalSources(db, projectId, [item]))
          ? item
          : { kind: item.kind, role: item.role, accessible: false },
      ),
    );
  }
  return rows;
}
