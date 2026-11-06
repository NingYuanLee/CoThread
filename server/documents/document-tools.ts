import { z } from "zod/v3";
import { libraryChange } from "./library.ts";
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from "./project-library.ts";
import { query } from "../db.ts";
import { HttpError } from "../http-error.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "../types.ts";

const id = z.string().uuid();

export const documentToolSchemas = {
  list_documents: {
    projectId: id.optional(),
    folderId: id.optional(),
    recursive: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).default(100),
    offset: z.number().int().min(0).max(100000).default(0),
  },
  manage_document: {
    projectId: id.optional(),
    action: z.enum(["rename", "move", "delete", "restore"]),
    artifactId: id.optional(),
    versionId: id.optional(),
    scope: z.enum(["document", "version"]).optional(),
    name: z.string().min(1).max(160).optional(),
    folderId: id.nullable().optional(),
  },
  manage_folder: {
    projectId: id.optional(),
    action: z.enum(["create", "rename", "move", "delete"]),
    folderId: id.optional(),
    name: z.string().min(1).max(160).optional(),
    parentId: id.nullable().optional(),
  },
};

/** 工具入参（三个 schema 的并集）。 */
type DocumentToolArgs = {
  projectId?: string | null;
  folderId?: string | null;
  recursive?: boolean;
  limit?: number;
  offset?: number;
  action?: string;
  artifactId?: string;
  versionId?: string;
  scope?: string;
  name?: string;
  parentId?: string | null;
};

/** 文件夹行。 */
type FolderRow = { id: string; parent_id?: string | null };

/** 版本行。 */
type VersionRow = {
  artifact_id: string;
  version?: number | null;
  folder_id?: string | null;
  deleted_at?: unknown;
};

/** 工具调用所需的 Service 视图。 */
export type DocumentToolService = {
  db: Pool;
  thread(
    user: DocumentToolUser,
    threadId: string,
    write?: boolean,
    db?: Db,
  ): Promise<{ project_id: string }>;
  project(
    user: DocumentToolUser,
    projectId: string,
    options?: { display?: boolean },
  ): Promise<{ folders: FolderRow[]; versions: VersionRow[] }>;
  assertDocumentScopeAvailable(
    db: Db,
    projectId: string,
    threadId: string | null,
  ): Promise<unknown>;
  /** 下面两个由 `libraryChange` 的 Service 视图要求：工具面直接复用门面的成员判定。 */
  member(user: DocumentToolUser, projectId: string, write?: boolean, db?: Db): Promise<unknown>;
  assertOfficialOrganizing(db: Db, projectId: string): Promise<unknown>;
};

/** 发起工具调用的人。 */
export type DocumentToolUser = { id: string; kind?: string | null };

/** 工具调用的任务上下文。 */
export type DocumentToolJob = { thread_id: string; message_id: string };

function folderDescendantIds(rootId: string, folders: FolderRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const list = children.get(folder.parent_id) || [];
    list.push(folder.id);
    children.set(folder.parent_id, list);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const child of children.get(current) || []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return ids;
}

function latestVersions(versions: VersionRow[]): VersionRow[] {
  const latest = new Map<string, VersionRow>();
  for (const item of versions) {
    if (item.deleted_at) continue;
    const prev = latest.get(item.artifact_id);
    if (!prev || (item.version || 0) > (prev.version || 0)) latest.set(item.artifact_id, item);
  }
  return [...latest.values()];
}

export function listDocumentScope(
  folders: FolderRow[],
  versions: VersionRow[],
  {
    folderId,
    recursive = false,
    limit = 100,
    offset = 0,
  }: { folderId?: string | null; recursive?: boolean; limit?: number; offset?: number } = {},
) {
  if (!folderId) {
    const end = offset + limit;
    return {
      folders: folders.slice(offset, end),
      versions: versions.slice(offset, end),
      page: { nextOffset: end, hasMore: folders.length > end || versions.length > end },
    };
  }
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new HttpError(404, "文件夹不存在");
  const scopeIds = recursive ? folderDescendantIds(folderId, folders) : new Set([folderId]);
  const childFolders = folders.filter((item) =>
    recursive ? item.id !== folderId && scopeIds.has(item.id) : item.parent_id === folderId,
  );
  const childVersions = latestVersions(versions).filter(
    (item) =>
      item.folder_id && (recursive ? scopeIds.has(item.folder_id) : item.folder_id === folderId),
  );
  const end = offset + limit;
  return {
    folder,
    recursive: !!recursive,
    folders: childFolders.slice(offset, end),
    versions: childVersions.slice(offset, end),
    page: {
      nextOffset: end,
      hasMore: childFolders.length > end || childVersions.length > end,
    },
  };
}

export async function documentTool(
  service: DocumentToolService,
  user: DocumentToolUser,
  name: string,
  input: unknown,
  job?: DocumentToolJob | null,
): Promise<Record<string, unknown>> {
  const schema = (documentToolSchemas as Record<string, Record<string, z.ZodTypeAny>>)[name];
  const args = z.object(schema).parse(input) as DocumentToolArgs;
  let projectId = args.projectId;
  if (job) {
    const thread = await service.thread(user, job.thread_id);
    if (projectId && projectId !== thread.project_id) throw new HttpError(403, "仅可操作当前项目");
    projectId = thread.project_id;
  }
  id.parse(projectId);
  if (name === "list_documents") {
    if (job)
      await service.assertDocumentScopeAvailable(service.db, projectId as string, job.thread_id);
    const p = await service.project(user, projectId as string, { display: true });
    const folders = job ? filterProjectLibraryFolders(p.folders) : p.folders;
    const versions = job ? filterProjectLibraryVersions(p.versions) : p.versions;
    return { projectId, ...listDocumentScope(folders, versions, args) };
  }
  const options = {
    tool: true,
    authorize: job
      ? async (db: Db) => {
          await service.thread(user, job.thread_id, true, db);
          const [r] = await query<{ status?: string | null }>(
            db,
            "SELECT status FROM assistant_replies WHERE message_id=? FOR UPDATE",
            [job.message_id],
          );
          if (r?.status !== "running") throw new HttpError(409, "任务已停止");
        }
      : undefined,
  };
  if (name === "manage_document") {
    const action = args.action as string;
    if (["delete", "restore"].includes(action) && !args.scope)
      throw new HttpError(400, "删除或恢复必须明确scope：document为整份文档，version为单个版本");
    const version = args.scope === "version";
    if (version && !["delete", "restore"].includes(action))
      throw new HttpError(400, "版本仅支持删除或恢复；重命名和移动作用于整份文档");
    const target = id.parse(version ? args.versionId : args.artifactId);
    const data = {
      ...(job ? { threadId: job.thread_id } : {}),
      ...(action === "rename"
        ? { name: z.string().min(1).parse(args.name) }
        : action === "move"
          ? { folderId: id.nullable().parse(args.folderId) }
          : { deleted: action === "delete" }),
    };
    return {
      ...((await libraryChange(
        service,
        user,
        projectId as string,
        version ? "version" : "artifact",
        target,
        data,
        options,
      )) as Record<string, unknown>),
      action,
      scope: args.scope || "document",
    };
  }
  const action = args.action as string;
  const target = action === "create" ? null : id.parse(args.folderId);
  const data = {
    ...(job ? { threadId: job.thread_id } : {}),
    ...(action === "create" || action === "rename"
      ? {
          name: z.string().min(1).parse(args.name),
          ...(action === "create" ? { parentId: args.parentId || null } : {}),
        }
      : action === "move"
        ? { parentId: id.nullable().parse(args.parentId) }
        : {}),
  };
  return {
    ...((await libraryChange(
      service,
      user,
      projectId as string,
      action === "delete" ? "remove-folder" : "folder",
      target,
      data,
      options,
    )) as Record<string, unknown>),
    action,
  };
}
