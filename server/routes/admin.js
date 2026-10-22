import {
  ADMIN_PERMISSION_TREE,
  adminPermissionForRequest,
} from "../../shared/admin-permissions.js";
import { query } from "../db.js";
import { HttpError } from "../service.js";
import {
  adminAccess,
  adminRoleOptions,
  assignAdminRoles,
  deleteAdminRole,
  listAdminRoles,
  requireAdminPermission,
  saveAdminRole,
} from "../admin-rbac.js";
import { adminTaskDetail, listAdminWork, updateAdminWork } from "../admin-work.js";
import { listAccountChanges, listAccountLogins } from "../account-audit.js";
import {
  listMyProjects,
  listMyWork,
  myProjectImage,
  myProjectMemberAvatar,
  myTaskDetail,
} from "../my-work.js";
import { parseStoredImage } from "../project-image.js";
import {
  adminPluginManagement,
  archivePromptSkill,
  createPromptSkill,
  updatePromptSkill,
} from "../agent-capabilities.js";
import {
  loadPlatformModelSettings,
  platformModelSettingsView,
  savePlatformModelSettings,
} from "../platform-model-settings.js";

/** 管理域路由。守卫与全部 /api/admin 端点集中在此，注册顺序与原先一致。 */
export function registerAdminRoutes(app, { db, service }) {
  app.use("/api/admin", async (req, _res, next) => {
    const permission = adminPermissionForRequest(req.method, req.path);
    if (permission === false) throw new HttpError(403, "未授权的管理接口");
    if (permission) await requireAdminPermission(db, req.user, permission);
    next();
  });
  app.get("/api/admin/access", async (req, res) => res.json(await adminAccess(db, req.user)));
  app.get("/api/admin/permissions", (_req, res) => res.json(ADMIN_PERMISSION_TREE));
  app.get("/api/admin/roles", async (req, res) => res.json(await listAdminRoles(db, req.user)));
  app.post("/api/admin/roles", async (req, res) =>
    res.status(201).json(await saveAdminRole(db, req.user, null, req.body)),
  );
  app.patch("/api/admin/roles/:id", async (req, res) =>
    res.json(await saveAdminRole(db, req.user, req.params.id, req.body)),
  );
  app.delete("/api/admin/roles/:id", async (req, res) =>
    res.json(await deleteAdminRole(db, req.user, req.params.id)),
  );
  app.get("/api/admin/role-members", async (_req, res) => {
    const [members, assignments] = await Promise.all([
      query(
        db,
        "SELECT id,name,user_number,COALESCE(username,email) username,is_super_admin,disabled_at FROM users ORDER BY user_number",
      ),
      query(db, "SELECT user_id,role_id FROM admin_user_roles"),
    ]);
    res.json(
      members.map((member) => ({
        ...member,
        roleIds: assignments.filter((row) => row.user_id === member.id).map((row) => row.role_id),
      })),
    );
  });
  app.get("/api/admin/accounts/:id/role-options", async (req, res) =>
    res.json(await adminRoleOptions(db, req.user, req.params.id)),
  );
  app.get("/api/admin/accounts/:id/avatar", async (req, res) => {
    const [account] = await query(db, "SELECT avatar FROM users WHERE id=?", [req.params.id]);
    const image = account?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/admin/projects/:id/image", async (req, res) => {
    const access = await adminAccess(db, req.user);
    if (
      !["projects", "accounts", "iterations", "tasks"].some((key) =>
        access.permissions.includes(key),
      )
    )
      throw new HttpError(403, "没有此管理操作的权限");
    const [project] = await query(db, "SELECT image FROM projects WHERE id=?", [req.params.id]);
    const image = parseStoredImage(project?.image);
    if (!image) throw new HttpError(404, "项目图片不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/admin/projects/:projectId/members/:userId/avatar", async (req, res) => {
    const [member] = await query(
      db,
      `SELECT u.avatar FROM users u JOIN projects p ON p.id=?
       WHERE u.id=? AND (p.created_by=u.id OR p.project_leader_id=u.id OR EXISTS
         (SELECT 1 FROM members m WHERE m.project_id=p.id AND m.user_id=u.id))`,
      [req.params.projectId, req.params.userId],
    );
    const image = member?.avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.put("/api/admin/accounts/:id/roles", async (req, res) =>
    res.json(await assignAdminRoles(db, req.user, req.params.id, req.body)),
  );
  for (const kind of ["iterations", "tasks"]) {
    app.get(`/api/admin/${kind}`, async (req, res) =>
      res.json(await listAdminWork(db, req.user, kind, req.query)),
    );
    app.patch(`/api/admin/${kind}/:id`, async (req, res) =>
      res.json(await updateAdminWork(db, req.user, kind, req.params.id, req.body)),
    );
  }
  app.get("/api/admin/tasks/:id", async (req, res) =>
    res.json(await adminTaskDetail(db, req.user, req.params.id)),
  );
  app.get("/api/admin/my/projects", async (req, res) =>
    res.json(await listMyProjects(db, req.user)),
  );
  app.get("/api/admin/my/projects/:projectId/image", async (req, res) => {
    const image = parseStoredImage(await myProjectImage(db, req.user, req.params.projectId));
    if (!image) throw new HttpError(404, "项目图片不存在");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/admin/my/projects/:projectId/members/:userId/avatar", async (req, res) => {
    const avatar = await myProjectMemberAvatar(
      db,
      req.user,
      req.params.projectId,
      req.params.userId,
    );
    const image = avatar?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!image) throw new HttpError(404, "头像不存在");
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
    res.type(image[1]).send(Buffer.from(image[2], "base64"));
  });
  app.get("/api/admin/my/iterations", async (req, res) =>
    res.json(await listMyWork(db, req.user, "iterations", req.query)),
  );
  app.get("/api/admin/my/tasks", async (req, res) =>
    res.json(await listMyWork(db, req.user, "tasks", req.query)),
  );
  app.get("/api/admin/my/tasks/:id", async (req, res) =>
    res.json(await myTaskDetail(db, req.user, req.params.id)),
  );
  app.get("/api/admin/projects", async (req, res) =>
    res.json(await service.adminProjects(req.user)),
  );
  app.post("/api/admin/projects", async (req, res) =>
    res.status(201).json(await service.adminCreateProject(req.user, req.body)),
  );
  app.patch("/api/admin/projects/:id", async (req, res) =>
    res.json(await service.updateAdminProject(req.user, req.params.id, req.body)),
  );
  app.patch("/api/admin/projects/:id/archive", async (req, res) =>
    res.json(await service.setProjectArchived(req.user, req.params.id, true)),
  );
  app.patch("/api/admin/projects/:id/restore", async (req, res) =>
    res.json(await service.setProjectArchived(req.user, req.params.id, false)),
  );
  app.post("/api/admin/projects/:id/leader-recovery", async (req, res) =>
    res.json(await service.recoverProjectLeader(req.user, req.params.id, req.body)),
  );
  app.get("/api/admin/accounts", async (req, res) =>
    res.json(await service.adminAccounts(req.user)),
  );
  app.get("/api/admin/account-changes", async (req, res) =>
    res.json(await listAccountChanges(db, req.user, req.query)),
  );
  app.get("/api/admin/account-logins", async (req, res) =>
    res.json(await listAccountLogins(db, req.user, req.query)),
  );
  app.post("/api/admin/accounts", async (req, res) =>
    res.status(201).json(await service.createUser(req.user, req.body)),
  );
  app.patch("/api/admin/accounts/:id/status", async (req, res) =>
    res.json(await service.setAccountDisabled(req.user, req.params.id, req.body)),
  );
  app.post("/api/admin/accounts/:id/reset-password", async (req, res) =>
    res.json(await service.resetAccountPassword(req.user, req.params.id)),
  );
  app.get("/api/admin/plugins", async (req, res) =>
    res.json(await adminPluginManagement(service, req.user)),
  );
  app.post("/api/admin/plugins/skills", async (req, res) =>
    res.status(201).json(await createPromptSkill(service, req.user, req.body)),
  );
  app.patch("/api/admin/plugins/skills/:id", async (req, res) =>
    res.json(await updatePromptSkill(service, req.user, req.params.id, req.body)),
  );
  app.delete("/api/admin/plugins/skills/:id", async (req, res) =>
    res.json(await archivePromptSkill(service, req.user, req.params.id)),
  );
  app.get("/api/admin/model-settings", async (_req, res) => {
    await loadPlatformModelSettings(db);
    res.json(platformModelSettingsView());
  });
  app.put("/api/admin/model-settings", async (req, res) =>
    res.json(await savePlatformModelSettings(db, req.user, req.body)),
  );
}
