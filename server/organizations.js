import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { requireAdminPermission } from "./admin-rbac.js";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { backfillParticipantBriefs, clearParticipantBriefs } from "./wiki-briefs.js";

const uuid = z.string().uuid();
const nameField = z.string().trim().min(1).max(80);
const createInput = z.object({ name: nameField, parentId: uuid.nullable().optional() }).strict();
const updateInput = z
  .object({
    name: nameField.optional(),
    parentId: uuid.nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.parentId !== undefined || value.sortOrder !== undefined,
    { message: "没有要修改的内容" },
  );
const memberInput = z
  .object({ userId: uuid, kind: z.enum(["primary", "secondary"]).nullable() })
  .strict();
const linkInput = z
  .object({
    action: z.enum([
      "set-host",
      "replace-host",
      "clear-host",
      "add-participant",
      "remove-participant",
    ]),
    orgId: uuid.optional(),
  })
  .strict();

const scopeSql = [
  "CASE",
  " WHEN h.org_id IS NULL THEN 'unassigned'",
  " WHEN EXISTS (",
  "  SELECT 1 FROM project_org_links x WHERE x.project_id=p.id AND x.role='participant'",
  " ) THEN 'cross'",
  " ELSE 'independent'",
  "END",
].join("");

function mapOrg(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    archivedAt: row.archived_at,
    childCount: Number(row.child_count || 0),
    primaryCount: Number(row.primary_count || 0),
    hostCount: Number(row.host_count || 0),
  };
}

async function insertLog(conn, sql, params) {
  await query(conn, sql, params);
}

async function lockOrg(conn, orgId) {
  const [org] = await query(conn, "SELECT * FROM organizations WHERE id=? FOR UPDATE", [orgId]);
  if (!org) throw new HttpError(404, "组织不存在");
  return org;
}

async function assertParent(conn, orgId, parentId) {
  if (parentId == null) return;
  if (parentId === orgId) throw new HttpError(409, "不能把组织的上级设成自己");
  let current = parentId;
  const seen = new Set();
  while (current) {
    if (current === orgId) throw new HttpError(409, "不能把组织移到自己的下级下面");
    if (seen.has(current)) throw new HttpError(409, "组织上级形成了环");
    seen.add(current);
    const [row] = await query(
      conn,
      "SELECT parent_id, archived_at FROM organizations WHERE id=? FOR UPDATE",
      [current],
    );
    if (!row) throw new HttpError(404, "上级组织不存在");
    if (row.archived_at) throw new HttpError(409, "不能挂到已归档的组织下面");
    current = row.parent_id;
  }
}

async function projectLinkView(conn, projectId) {
  const links = await query(
    conn,
    "SELECT org_id, role FROM project_org_links WHERE project_id=? ORDER BY role, org_id",
    [projectId],
  );
  const host = links.find((link) => link.role === "host");
  const participantOrgIds = links
    .filter((link) => link.role === "participant")
    .map((link) => link.org_id);
  return {
    projectId,
    hostOrgId: host ? host.org_id : null,
    participantOrgIds,
    scope: !host ? "unassigned" : participantOrgIds.length ? "cross" : "independent",
  };
}

const orgSelect = [
  "SELECT o.id,o.parent_id,o.name,o.sort_order,o.archived_at,",
  "(SELECT COUNT(*) FROM organizations c WHERE c.parent_id=o.id) child_count,",
  "(SELECT COUNT(*) FROM org_members m WHERE m.org_id=o.id AND m.kind='primary') primary_count,",
  "(SELECT COUNT(*) FROM project_org_links l WHERE l.org_id=o.id AND l.role='host') host_count",
  "FROM organizations o",
].join(" ");

export async function listOrganizations(db, user) {
  await requireAdminPermission(db, user, "orgs");
  const rows = await query(db, orgSelect + " ORDER BY o.sort_order,o.name,o.id");
  return { orgs: rows.map(mapOrg) };
}

export async function getOrganization(db, user, orgId) {
  await requireAdminPermission(db, user, "orgs");
  if (!uuid.safeParse(orgId).success) throw new HttpError(404, "组织不存在");
  const [org] = await query(
    db,
    "SELECT id,parent_id,name,sort_order,archived_at FROM organizations WHERE id=?",
    [orgId],
  );
  if (!org) throw new HttpError(404, "组织不存在");
  const members = await query(
    db,
    "SELECT m.user_id,u.name,COALESCE(u.username,u.email,'') username,u.disabled_at,m.kind FROM org_members m JOIN users u ON u.id=m.user_id WHERE m.org_id=? ORDER BY u.name,m.user_id",
    [orgId],
  );
  const projects = await query(
    db,
    "SELECT p.id project_id,p.name,l.role, " +
      scopeSql +
      " scope FROM project_org_links l JOIN projects p ON p.id=l.project_id LEFT JOIN project_org_links h ON h.project_id=p.id AND h.role='host' WHERE l.org_id=? ORDER BY p.name,p.id",
    [orgId],
  );
  const users = await query(
    db,
    "SELECT u.id,u.name,COALESCE(u.username,u.email,'') username,u.disabled_at, (SELECT m.org_id FROM org_members m WHERE m.user_id=u.id AND m.kind='primary' LIMIT 1) primary_org_id FROM users u ORDER BY u.name,u.id",
  );
  const projectChoices = await query(
    db,
    "SELECT p.id,p.name,p.archived_at,h.org_id host_org_id, " +
      scopeSql +
      " scope FROM projects p LEFT JOIN project_org_links h ON h.project_id=p.id AND h.role='host' ORDER BY p.archived_at IS NOT NULL,p.name,p.id",
  );
  return {
    org: {
      id: org.id,
      parentId: org.parent_id,
      name: org.name,
      sortOrder: Number(org.sort_order),
      archivedAt: org.archived_at,
    },
    members: members.map((row) => ({
      userId: row.user_id,
      name: row.name,
      username: row.username,
      disabledAt: row.disabled_at,
      kind: row.kind,
    })),
    projects: projects.map((row) => ({
      projectId: row.project_id,
      name: row.name,
      role: row.role,
      scope: row.scope,
    })),
    users: users.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      disabledAt: row.disabled_at,
      primaryOrgId: row.primary_org_id,
    })),
    projectChoices: projectChoices.map((row) => ({
      id: row.id,
      name: row.name,
      archivedAt: row.archived_at,
      hostOrgId: row.host_org_id,
      scope: row.scope,
    })),
  };
}

export async function createOrganization(db, user, input) {
  await requireAdminPermission(db, user, "orgs.update");
  const data = createInput.parse(input);
  const id = randomUUID();
  return transaction(db, async (conn) => {
    await assertParent(conn, id, data.parentId ?? null);
    await query(conn, "INSERT INTO organizations(id,parent_id,name,created_by) VALUES(?,?,?,?)", [
      id,
      data.parentId ?? null,
      data.name,
      user.id,
    ]);
    await insertLog(
      conn,
      "INSERT INTO org_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
      [
        randomUUID(),
        user.id,
        "created",
        id,
        JSON.stringify({ name: data.name, parentId: data.parentId ?? null }),
      ],
    );
    const [row] = await query(conn, orgSelect + " WHERE o.id=?", [id]);
    return mapOrg(row);
  });
}

export async function updateOrganization(db, user, orgId, input) {
  await requireAdminPermission(db, user, "orgs.update");
  const data = updateInput.parse(input);
  return transaction(db, async (conn) => {
    const org = await lockOrg(conn, orgId);
    if (org.archived_at) throw new HttpError(409, "已归档的组织不能改名或移动");
    if (data.parentId !== undefined) await assertParent(conn, orgId, data.parentId);
    const name = data.name ?? org.name;
    const parentId = data.parentId === undefined ? org.parent_id : data.parentId;
    const sortOrder = data.sortOrder === undefined ? org.sort_order : data.sortOrder;
    await query(conn, "UPDATE organizations SET name=?, parent_id=?, sort_order=? WHERE id=?", [
      name,
      parentId,
      sortOrder,
      orgId,
    ]);
    if (data.name !== undefined && data.name !== org.name) {
      await insertLog(
        conn,
        "INSERT INTO org_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          user.id,
          "renamed",
          orgId,
          JSON.stringify({ from: org.name, to: data.name }),
        ],
      );
    }
    if (data.parentId !== undefined && data.parentId !== org.parent_id) {
      await insertLog(
        conn,
        "INSERT INTO org_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          user.id,
          "moved",
          orgId,
          JSON.stringify({ from: org.parent_id, to: data.parentId }),
        ],
      );
    }
    const [row] = await query(conn, orgSelect + " WHERE o.id=?", [orgId]);
    return mapOrg(row);
  });
}

export async function archiveOrganization(db, user, orgId) {
  await requireAdminPermission(db, user, "orgs.update");
  return transaction(db, async (conn) => {
    const org = await lockOrg(conn, orgId);
    if (!org.archived_at) {
      const [child] = await query(
        conn,
        "SELECT id FROM organizations WHERE parent_id=? AND archived_at IS NULL LIMIT 1 FOR UPDATE",
        [orgId],
      );
      if (child) throw new HttpError(409, "请先归档下级组织");
      await query(conn, "UPDATE organizations SET archived_at=UTC_TIMESTAMP(3) WHERE id=?", [
        orgId,
      ]);
      await insertLog(
        conn,
        "INSERT INTO org_change_logs(id,actor_user_id,action,target_id,details) VALUES(?,?,?,?,?)",
        [randomUUID(), user.id, "archived", orgId, JSON.stringify({ name: org.name })],
      );
    }
    const [row] = await query(
      conn,
      "SELECT id,parent_id,name,sort_order,archived_at FROM organizations WHERE id=?",
      [orgId],
    );
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      sortOrder: Number(row.sort_order),
      archivedAt: row.archived_at,
    };
  });
}

export async function setOrganizationMember(db, user, orgId, input) {
  await requireAdminPermission(db, user, "orgs.assign");
  const data = memberInput.parse(input);
  return transaction(db, async (conn) => {
    const org = await lockOrg(conn, orgId);
    const [account] = await query(conn, "SELECT id,disabled_at FROM users WHERE id=? FOR UPDATE", [
      data.userId,
    ]);
    if (!account) throw new HttpError(404, "账号不存在");
    const memberships = await query(
      conn,
      "SELECT org_id, kind FROM org_members WHERE user_id=? FOR UPDATE",
      [data.userId],
    );
    const here = memberships.find((row) => row.org_id === orgId);
    const primary = memberships.find((row) => row.kind === "primary");
    if (data.kind == null) {
      if (!here) throw new HttpError(404, "这个账号不在该组织中");
      await query(conn, "DELETE FROM org_members WHERE org_id=? AND user_id=?", [
        orgId,
        data.userId,
      ]);
      await insertLog(
        conn,
        "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          data.userId,
          user.id,
          "org_member_removed",
          JSON.stringify({ orgId, orgName: org.name, kind: here.kind }),
        ],
      );
      return { userId: data.userId, removed: true };
    }
    if (org.archived_at) throw new HttpError(409, "已归档的组织不能再安排人员");
    if (!here && account.disabled_at) throw new HttpError(409, "已停用的账号不能加入组织");
    if (data.kind === "primary" && account.disabled_at)
      throw new HttpError(409, "已停用的账号不能设为主组织");
    if (data.kind === "primary" && primary && primary.org_id !== orgId) {
      throw new HttpError(409, "这个账号已经有主组织，请先从原组织移出");
    }
    if (here) {
      await query(conn, "UPDATE org_members SET kind=? WHERE org_id=? AND user_id=?", [
        data.kind,
        orgId,
        data.userId,
      ]);
    } else {
      await query(conn, "INSERT INTO org_members(org_id,user_id,kind) VALUES(?,?,?)", [
        orgId,
        data.userId,
        data.kind,
      ]);
    }
    await insertLog(
      conn,
      "INSERT INTO account_change_logs(id,target_user_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [
        randomUUID(),
        data.userId,
        user.id,
        "org_member_set",
        JSON.stringify({
          orgId,
          orgName: org.name,
          kind: data.kind,
          from: here ? here.kind : null,
        }),
      ],
    );
    const [row] = await query(
      conn,
      "SELECT m.user_id,u.name,COALESCE(u.username,u.email,'') username,u.disabled_at,m.kind FROM org_members m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.user_id=?",
      [orgId, data.userId],
    );
    return {
      userId: row.user_id,
      name: row.name,
      username: row.username,
      disabledAt: row.disabled_at,
      kind: row.kind,
    };
  });
}

export async function changeProjectOrganizationLink(db, user, projectId, input) {
  await requireAdminPermission(db, user, "orgs.link");
  const data = linkInput.parse(input);
  if (data.action !== "clear-host" && !data.orgId) throw new HttpError(400, "需要指定组织");
  return transaction(db, async (conn) => {
    const [project] = await query(conn, "SELECT id,name FROM projects WHERE id=? FOR UPDATE", [
      projectId,
    ]);
    if (!project) throw new HttpError(404, "项目不存在");
    const links = await query(
      conn,
      "SELECT org_id, role FROM project_org_links WHERE project_id=? FOR UPDATE",
      [projectId],
    );
    const host = links.find((link) => link.role === "host");
    const participants = new Set(
      links.filter((link) => link.role === "participant").map((link) => link.org_id),
    );
    const org = data.orgId ? await lockOrg(conn, data.orgId) : null;
    if (data.action === "set-host") {
      if (host && host.org_id !== data.orgId)
        throw new HttpError(409, "这个项目已有主办，请使用更换主办");
      if (!host) {
        if (org.archived_at) throw new HttpError(409, "已归档的组织不能成为主办");
        if (participants.has(data.orgId))
          throw new HttpError(409, "主办组织不能同时是参与方，请先撤下参与");
        await query(
          conn,
          "INSERT INTO project_org_links(project_id,org_id,role) VALUES(?,?,'host')",
          [projectId, data.orgId],
        );
        await insertLog(
          conn,
          "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
          [
            randomUUID(),
            projectId,
            user.id,
            "org_host_set",
            JSON.stringify({ orgId: data.orgId, orgName: org.name }),
          ],
        );
      }
    } else if (data.action === "replace-host") {
      if (!host) throw new HttpError(409, "这个项目还没有主办");
      if (host.org_id === data.orgId) throw new HttpError(409, "新主办与当前主办相同");
      if (org.archived_at) throw new HttpError(409, "已归档的组织不能成为主办");
      if (participants.has(data.orgId))
        throw new HttpError(409, "新主办不能同时是参与方，请先撤下参与");
      await query(conn, "DELETE FROM project_org_links WHERE project_id=? AND role='host'", [
        projectId,
      ]);
      await query(
        conn,
        "INSERT INTO project_org_links(project_id,org_id,role) VALUES(?,?,'host')",
        [projectId, data.orgId],
      );
      await insertLog(
        conn,
        "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          projectId,
          user.id,
          "org_host_replaced",
          JSON.stringify({ from: host.org_id, orgId: data.orgId, orgName: org.name }),
        ],
      );
    } else if (data.action === "clear-host") {
      if (!host) throw new HttpError(409, "这个项目没有主办");
      await query(conn, "DELETE FROM project_org_links WHERE project_id=? AND role='host'", [
        projectId,
      ]);
      await insertLog(
        conn,
        "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          projectId,
          user.id,
          "org_host_cleared",
          JSON.stringify({ orgId: host.org_id }),
        ],
      );
    } else if (data.action === "add-participant") {
      if (org.archived_at) throw new HttpError(409, "已归档的组织不能成为参与方");
      if (host && host.org_id === data.orgId)
        throw new HttpError(409, "主办组织不能同时成为参与方");
      if (participants.has(data.orgId)) throw new HttpError(409, "该组织已经是参与方");
      await query(
        conn,
        "INSERT INTO project_org_links(project_id,org_id,role) VALUES(?,?,'participant')",
        [projectId, data.orgId],
      );
      await backfillParticipantBriefs(conn, projectId, data.orgId);
      await insertLog(
        conn,
        "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          projectId,
          user.id,
          "org_participant_added",
          JSON.stringify({ orgId: data.orgId, orgName: org.name }),
        ],
      );
    } else {
      if (!participants.has(data.orgId)) throw new HttpError(409, "该组织不是这个项目的参与方");
      await query(
        conn,
        "DELETE FROM project_org_links WHERE project_id=? AND org_id=? AND role='participant'",
        [projectId, data.orgId],
      );
      await clearParticipantBriefs(conn, projectId, data.orgId);
      await insertLog(
        conn,
        "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          projectId,
          user.id,
          "org_participant_removed",
          JSON.stringify({ orgId: data.orgId }),
        ],
      );
    }
    return projectLinkView(conn, projectId);
  });
}
