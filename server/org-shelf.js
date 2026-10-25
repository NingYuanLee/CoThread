import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { requireAdminPermission } from "./admin-rbac.js";
import { getWikiPage, listWikiPages } from "./wiki-pages.js";

async function activeUser(db, user) {
  const [row] = await query(db, "SELECT id, disabled_at disabledAt FROM users WHERE id=?", [
    user.id,
  ]);
  if (!row || row.disabledAt) throw new HttpError(403, "没有此范围的查看权限");
  return row;
}

async function orgMembership(db, user, orgId) {
  await activeUser(db, user);
  const [org] = await query(
    db,
    "SELECT id, name, archived_at archivedAt FROM organizations WHERE id=?",
    [orgId],
  );
  if (!org) throw new HttpError(404, "组织不存在");
  const [member] = await query(db, "SELECT kind FROM org_members WHERE org_id=? AND user_id=?", [
    orgId,
    user.id,
  ]);
  let canManage = false;
  try {
    await requireAdminPermission(db, user, "orgs.update");
    canManage = true;
  } catch (error) {
    if (error.status !== 403) throw error;
  }
  if (!member && !canManage) throw new HttpError(403, "没有此组织的查看权限");
  return { org, member: !!member, canManage };
}

function guideInput(input) {
  return z
    .object({ title: z.string().trim().min(1).max(160), body: z.string().max(60000) })
    .parse(input);
}

export async function readOrgShelf(service, user, orgId) {
  const access = await orgMembership(service.db, user, orgId);
  const guides = await query(
    service.db,
    "SELECT id, title, body, status FROM org_guides WHERE org_id=? ORDER BY updated_at DESC, id",
    [orgId],
  );
  const hosted = await query(
    service.db,
    "SELECT p.id, p.name FROM project_org_links l JOIN projects p ON p.id=l.project_id WHERE l.org_id=? AND l.role='host' ORDER BY p.name, p.id",
    [orgId],
  );
  const projects = [];
  for (const project of hosted) {
    const pages = await query(
      service.db,
      "SELECT id, kind, title, status FROM wiki_pages WHERE project_id=? ORDER BY updated_at DESC, id",
      [project.id],
    );
    projects.push({ id: project.id, name: project.name, pages });
  }
  const briefs = await query(
    service.db,
    "SELECT b.id, b.project_id projectId, p.name projectName, b.page_id pageId, b.title, b.brief FROM project_org_briefs b JOIN projects p ON p.id=b.project_id WHERE b.org_id=? ORDER BY b.updated_at DESC, b.id",
    [orgId],
  );
  return {
    org: { id: access.org.id, name: access.org.name, archivedAt: access.org.archivedAt },
    guides,
    projects,
    briefs,
    canWrite: access.member || access.canManage,
  };
}

export async function createOrgGuide(service, user, orgId, input) {
  const access = await orgMembership(service.db, user, orgId);
  if (!access.member && !access.canManage) throw new HttpError(403, "没有编写这个组织指南的权限");
  if (access.org.archivedAt) throw new HttpError(409, "已归档的组织不能再写指南");
  const data = guideInput(input);
  const id = randomUUID();
  await query(
    service.db,
    "INSERT INTO org_guides(id,org_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,'current',?,?)",
    [id, orgId, data.title, data.body, user.id, user.id],
  );
  return readOrgShelf(service, user, orgId);
}

export async function readCompanyCatalog(service, user) {
  await activeUser(service.db, user);
  const orgs = await query(
    service.db,
    "SELECT id, name, parent_id parentId, archived_at archivedAt FROM organizations ORDER BY sort_order, name, id",
  );
  const guides = await query(
    service.db,
    "SELECT id, title, body, status FROM company_guides ORDER BY updated_at DESC, id",
  );
  let canWrite = false;
  try {
    await requireAdminPermission(service.db, user, "orgs.update");
    canWrite = true;
  } catch (error) {
    if (error.status !== 403) throw error;
  }
  return { orgs, guides, canWrite };
}

export async function createCompanyGuide(service, user, input) {
  await requireAdminPermission(service.db, user, "orgs.update");
  const data = guideInput(input);
  const id = randomUUID();
  await query(
    service.db,
    "INSERT INTO company_guides(id,title,body,status,created_by,updated_by) VALUES(?,?,?,'current',?,?)",
    [id, data.title, data.body, user.id, user.id],
  );
  return readCompanyCatalog(service, user);
}

async function matchingGuides(db, table, question, extraWhere, params) {
  const text = String(question || "").trim();
  if (!text) {
    return query(
      db,
      `SELECT id, title, body FROM ${table} WHERE status='current' ${extraWhere} ORDER BY updated_at DESC LIMIT 5`,
      params,
    );
  }
  return query(
    db,
    `SELECT id, title, body FROM ${table} WHERE status='current' ${extraWhere} AND MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE) ORDER BY MATCH(title, body) AGAINST (? IN NATURAL LANGUAGE MODE) DESC LIMIT 5`,
    [...params, text, text],
  );
}

export async function orgQuestionMaterials(service, user, orgId, question) {
  const access = await orgMembership(service.db, user, orgId);
  if (!access.member) throw new HttpError(403, "没有这个组织的提问权限");
  if (access.org.archivedAt) throw new HttpError(409, "已归档的组织不能再提问");
  const guides = await matchingGuides(service.db, "org_guides", question, "AND org_id=?", [orgId]);
  const text = String(question || "").trim();
  const briefs = text
    ? await query(
        service.db,
        "SELECT id, title, brief body FROM project_org_briefs WHERE org_id=? AND (title LIKE ? OR brief LIKE ?) ORDER BY updated_at DESC LIMIT 5",
        [orgId, "%" + text.slice(0, 40) + "%", "%" + text.slice(0, 40) + "%"],
      )
    : await query(
        service.db,
        "SELECT id, title, brief body FROM project_org_briefs WHERE org_id=? ORDER BY updated_at DESC LIMIT 5",
        [orgId],
      );
  const hosted = await query(
    service.db,
    "SELECT project_id projectId FROM project_org_links WHERE org_id=? AND role='host'",
    [orgId],
  );
  const pages = [];
  for (const link of hosted) {
    try {
      const found = await listWikiPages(service, user, link.projectId, question);
      for (const page of found.pages.filter((item) => item.status === "current").slice(0, 3)) {
        pages.push(await getWikiPage(service, user, link.projectId, page.id));
      }
    } catch (error) {
      if (error.status !== 403) throw error;
    }
  }
  return [
    ...guides.map((guide) => ({
      page: { id: guide.id, title: guide.title, body: guide.body, kind: "guide" },
      sources: [{ label: "组织指南" }],
      citation: { pageId: null, label: guide.title + " · 组织指南" },
    })),
    ...briefs.map((brief) => ({
      page: { id: brief.id, title: brief.title, body: brief.body, kind: "brief" },
      sources: [{ label: "参与简报" }],
      citation: { pageId: null, label: brief.title + " · 参与简报" },
    })),
    ...pages.map((item) => ({
      ...item,
      citation: { pageId: item.page.id, label: item.page.title },
    })),
  ];
}

export async function companyQuestionMaterials(service, user, question) {
  await activeUser(service.db, user);
  const guides = await matchingGuides(service.db, "company_guides", question, "", []);
  return guides.map((guide) => ({
    page: { id: guide.id, title: guide.title, body: guide.body, kind: "guide" },
    sources: [{ label: "公司指南" }],
    citation: { pageId: null, label: guide.title + " · 公司指南" },
  }));
}

export async function loginLanding(db, user) {
  const [thread] = await query(
    db,
    `SELECT t.id FROM threads t
      JOIN members m ON m.project_id=t.project_id AND m.user_id=?
      JOIN projects p ON p.id=t.project_id AND p.archived_at IS NULL
      WHERE t.archived_at IS NULL AND t.status='active'
      LIMIT 1`,
    [user.id],
  );
  if (thread) return { destination: "workspace", orgId: null };
  const [primary] = await query(
    db,
    `SELECT m.org_id orgId FROM org_members m
      JOIN organizations o ON o.id=m.org_id
      WHERE m.user_id=? AND m.kind='primary'
      LIMIT 1`,
    [user.id],
  );
  if (!primary) return { destination: "workspace", orgId: null };
  return { destination: "org", orgId: primary.orgId };
}
