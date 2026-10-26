import { attachThreadReads } from "./thread-reads.js";
import {
  AGENT_LAOWENG_PROFILE,
  AGENT_XIAOXIANG_MEMBER,
  AGENT_MEMBER,
} from "../shared/agent-member.js";
import { modelConfig } from "./model-config.js";
import { projectImageSchema, projectImageUrl, projectImageUrlSql } from "./project-image.js";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { ensureProjectLibraryRoots } from "./documents/index.js";
import { fail, id, title, preferredLocalExecutorJoin } from "./service-support.js";

export async function projectChangeOperation(
  service,
  db,
  projectId,
  actorUserId,
  action,
  details = {},
) {
  const changeId = randomUUID();
  await query(
    db,
    "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
    [changeId, projectId, actorUserId, action, JSON.stringify(details)],
  );
  // 项目级变更统一作为里程碑候选，具体是否值得长期保留交给 project_memory 结算。
  const { noteProjectMemorySignal } = await import("./project-memory.js");
  await noteProjectMemorySignal(
    db,
    projectId,
    "milestone",
    changeId,
    `${action}：${JSON.stringify(details).slice(0, 220)}`,
    { urgent: true },
  ).catch(() => {});
  return changeId;
}

export async function updateProjectOperation(service, user, projectId, input) {
  if (user.kind !== "session") fail(403, "项目设置需要人工登录");
  const data = z
    .object({
      name: title.max(120).optional(),
      description: z.string().max(4000).optional(),
      image: projectImageSchema.optional(),
    })
    .refine(
      (value) =>
        value.name !== undefined || value.description !== undefined || value.image !== undefined,
    )
    .parse(input);
  const next = {
    ...data,
    description: data.description === undefined ? undefined : data.description.trim(),
  };
  await transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM projects WHERE id=? FOR UPDATE", [projectId]);
    await service.projectManager(user, projectId, db);
    const [previous] = await query(
      db,
      "SELECT name,description,image FROM projects WHERE id=? FOR UPDATE",
      [projectId],
    );
    const name = next.name ?? previous.name;
    const description = next.description ?? previous.description;
    const image = next.image === undefined ? previous.image : next.image;
    await query(db, "UPDATE projects SET name=?,description=?,image=? WHERE id=?", [
      name,
      description,
      image,
      projectId,
    ]);
    await service.projectChange(db, projectId, user.id, "profile_updated", {
      before: { name: previous.name, description: previous.description },
      after: { name, description },
      ...(next.image === undefined ? {} : { image: next.image ? "updated" : "removed" }),
    });
  });
  const [updated] = await query(
    service.db,
    "SELECT id,name,description,image FROM projects WHERE id=?",
    [projectId],
  );
  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    image: projectImageUrl(updated.id, updated.image),
  };
}

export async function projectsOperation(service, user) {
  return query(
    service.db,
    `SELECT p.id,p.name,p.description,p.created_by,p.project_leader_id,p.created_at,p.archived_at,${projectImageUrlSql()} image,creator.name created_by_name,m.role,m.joined_at,m.tab_visible,m.tab_opened_at,m.tab_pinned_at,(SELECT COUNT(*) FROM threads t WHERE t.project_id=p.id AND t.status='active') active_threads
      FROM projects p JOIN users creator ON creator.id=p.created_by JOIN members m ON m.project_id=p.id WHERE m.user_id=? AND p.archived_at IS NULL${user.scope ? " AND p.id=?" : ""}
      ORDER BY m.tab_pinned_at DESC,m.tab_opened_at DESC,p.created_at DESC,p.id`,
    user.scope ? [user.id, user.scope] : [user.id],
  );
}

export async function updateProjectTabOperation(service, user, projectId, input) {
  if (user.kind === "api") fail(403, "请在界面中管理项目页签");
  await service.member(user, projectId);
  const { action } = z.object({ action: z.enum(["open", "close", "pin", "unpin"]) }).parse(input);
  const updates = {
    open: "tab_opened_at=COALESCE(tab_opened_at,UTC_TIMESTAMP(6)),tab_visible=TRUE",
    close: "tab_visible=FALSE",
    pin: "tab_pinned_at=UTC_TIMESTAMP(6)",
    unpin: "tab_pinned_at=NULL",
  };
  await transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]);
    await query(
      db,
      `UPDATE members SET ${updates[action]} WHERE project_id=? AND user_id=?${action === "close" ? " AND tab_pinned_at IS NULL" : action === "pin" ? " AND tab_visible=TRUE" : ""}`,
      [projectId, user.id],
    );
  });
  return service.projects(user);
}

export async function reorderProjectTabsOperation(service, user, input) {
  if (user.kind === "api") fail(403, "请在界面中管理项目页签");
  const { projectIds } = z.object({ projectIds: z.array(id).min(1).max(1000) }).parse(input);
  await transaction(service.db, async (db) => {
    await query(db, "SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]);
    const pinned = await query(
      db,
      "SELECT project_id FROM members WHERE user_id=? AND tab_visible=TRUE AND tab_pinned_at IS NOT NULL FOR UPDATE",
      [user.id],
    );
    const allowed = new Set(pinned.map((p) => p.project_id));
    if (
      projectIds.length !== allowed.size ||
      new Set(projectIds).size !== allowed.size ||
      projectIds.some((projectId) => !allowed.has(projectId))
    )
      fail(409, "固定项目列表已变化，请刷新后重试");
    // Pinned timestamps are ordering keys; opening times stay unchanged.
    const [clock] = await query(db, "SELECT UTC_TIMESTAMP(6) sort_time");
    for (const [index, projectId] of projectIds.entries()) {
      await query(
        db,
        "UPDATE members SET tab_pinned_at=DATE_SUB(?, INTERVAL ? MICROSECOND) WHERE user_id=? AND project_id=?",
        [clock.sort_time, index, user.id, projectId],
      );
    }
  });
  return service.projects(user);
}

export async function createProjectOperation(service, user, input) {
  if (user.kind === "api") fail(403, "请在界面中创建项目");
  const data = z
    .object({
      name: title.max(120),
      description: z.string().max(4000).default(""),
      image: projectImageSchema.nullish(),
    })
    .parse(input);
  const image = data.image || null;
  const projectId = randomUUID();
  await transaction(service.db, async (db) => {
    await query(
      db,
      "INSERT INTO projects(id,name,description,image,created_by,project_leader_id) VALUES(?,?,?,?,?,?)",
      [projectId, data.name, data.description, image, user.id, user.id],
    );
    await ensureProjectLibraryRoots(db, projectId);
    await query(
      db,
      "INSERT INTO members(project_id,user_id,role,tab_visible,tab_opened_at,role_changed_at) VALUES(?,?,?,TRUE,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",
      [projectId, user.id, "member"],
    );
    await service.projectChange(db, projectId, user.id, "created", {
      name: data.name,
      description: data.description,
      ...(image ? { image: "set" } : {}),
    });
  });
  return {
    id: projectId,
    name: data.name,
    description: data.description,
    image: projectImageUrl(projectId, image),
  };
}

export async function projectOperation(
  service,
  user,
  projectId,
  { display = false, includeLibrary = true } = {},
) {
  await service.member(user, projectId);
  if (includeLibrary) await ensureProjectLibraryRoots(service.db, projectId);
  const library = includeLibrary ? service.libraryQueries(projectId) : null;
  const projectQuery = query(
    service.db,
    `SELECT p.id,p.name,p.description,p.created_by,p.project_leader_id,p.created_at,p.archived_at,${projectImageUrlSql()} image,creator.name created_by_name FROM projects p JOIN users creator ON creator.id=p.created_by WHERE p.id=?`,
    [projectId],
  );
  const threadsQuery = query(
    service.db,
    `SELECT t.id,t.title,t.background,t.goal,t.status,t.created_at,t.archived_at,t.created_by,u.name creator,
       t.last_active_at
       FROM threads t JOIN users u ON u.id=t.created_by
       WHERE t.project_id=? ORDER BY t.last_active_at DESC,t.created_at DESC`,
    [projectId],
  );
  const membersQuery = query(
    service.db,
    `SELECT u.id,u.user_number,u.username,u.name,COALESCE(u.username,u.email) email,u.email bound_email,${display ? "CONCAT('/api/projects/',m.project_id,'/members/',u.id,'/avatar?v=',LEFT(SHA2(u.avatar,256),16)) avatar" : "u.avatar"},u.motto,u.identity_tags,m.role,
        c.id local_executor_id,c.name local_executor_name,c.platform local_executor_platform,c.version local_executor_version,c.last_seen_at local_executor_last_seen_at,
        CASE WHEN c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) THEN 1 ELSE 0 END local_executor_online,
        CASE WHEN cp.local_executor_id IS NULL THEN 0 ELSE 1 END local_executor_bound
       FROM members m JOIN users u ON u.id=m.user_id
       ${preferredLocalExecutorJoin()}
       LEFT JOIN local_executor_projects cp ON cp.local_executor_id=c.id AND cp.project_id=m.project_id
       WHERE m.project_id=?`,
    [projectId, projectId],
  );
  const [[project], threads, members, libraryRows, libraryRevision] = await Promise.all([
    projectQuery,
    threadsQuery,
    membersQuery,
    library
      ? Promise.all([library.versions, library.folders, library.documentOrganizationJobs])
      : Promise.resolve([[], [], []]),
    service.libraryRevision(projectId),
  ]);
  const [versions, folders, documentOrganizationJobs] = libraryRows;
  const libraryVersions = includeLibrary ? service.mapLibraryVersions(versions, folders) : [];
  const knowledgeModel = modelConfig("knowledge");
  const coordinatorModel = modelConfig("coordinator");
  const { loadProjectSummary } = await import("./project-memory.js");
  const projectSummary = await loadProjectSummary(service.db, projectId);
  return {
    ...project,
    longTermSummary: projectSummary
      ? {
          summary: projectSummary.summary,
          updatedAt: projectSummary.updatedAt,
          lastThreadTitle: projectSummary.lastThreadTitle || null,
        }
      : null,
    threads: await attachThreadReads(service.db, user.id, threads),
    members: [
      ...members.map((row) => {
        const {
          local_executor_id,
          local_executor_name,
          local_executor_platform,
          local_executor_version,
          local_executor_last_seen_at,
          local_executor_online,
          local_executor_bound,
          ...member
        } = row;
        return {
          ...member,
          kind: "human",
          localExecutor: local_executor_id
            ? {
                id: local_executor_id,
                name: local_executor_name,
                platform: local_executor_platform,
                version: local_executor_version,
                online: !!Number(local_executor_online),
                bound: !!Number(local_executor_bound),
                lastSeenAt: local_executor_last_seen_at,
              }
            : null,
        };
      }),
      {
        ...AGENT_MEMBER,
        kind: "laoweng",
        name: AGENT_LAOWENG_PROFILE.nickname,
        avatar: AGENT_LAOWENG_PROFILE.avatar,
        identity_tags: ["知识管理员"],
        nickname: AGENT_LAOWENG_PROFILE.nickname,
        title: AGENT_LAOWENG_PROFILE.title,
        display_avatar: AGENT_LAOWENG_PROFILE.avatar,
        motto: `${knowledgeModel.model} · ${knowledgeModel.reasoningEffort}`,
      },
      {
        ...AGENT_XIAOXIANG_MEMBER,
        kind: "xiaoxiang",
        motto: `${coordinatorModel.model} · ${coordinatorModel.reasoningEffort}`,
      },
    ],
    libraryIncluded: includeLibrary,
    libraryRevision,
    ...(includeLibrary ? { versions: libraryVersions, folders, documentOrganizationJobs } : {}),
  };
}

export async function adminCreateProjectOperation(service, user, input) {
  await service.adminPermission(user, "projects.create");
  return service.createProject(user, input);
}
