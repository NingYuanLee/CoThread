/**
 * CloudBase 路由。只挂 /api/projects/:id/cloudbase/ 下的管理面操作。
 * 小程序配置、预览、开发服务器、微信上传和发布审批不在这里。
 */
import {
  addCloudbaseDocument,
  cloudbaseFileUrls,
  createCloudbaseDirectory,
  createCloudbaseTimer,
  deleteCloudbaseFiles,
  deleteCloudbaseStorageEntry,
  deleteCloudbaseTimer,
  getCloudbaseFileDownload,
  invokeCloudbaseFunction,
  listCloudbaseCollections,
  listCloudbaseFiles,
  listCloudbaseFunctions,
  queryCloudbaseDocuments,
  readAdminProductionUrl,
  readCloudbaseAdminAccount,
  readCloudbaseAuthSettings,
  listCloudbaseAccountEnvironments,
  readCloudbaseEnvironments,
  removeCloudbaseDocument,
  saveCloudbaseAdminAccount,
  searchCloudbaseFunctionLogs,
  updateCloudbaseAuthSettings,
  updateCloudbaseDocument,
  uploadCloudbaseFile,
} from "../cloud-backend.js";

export function registerCloudbaseRoutes(app, { service }) {
  app.get("/api/projects/:id/cloudbase/auth-settings", async (req, res) =>
    res.json(
      await readCloudbaseAuthSettings(
        service,
        req.user,
        req.params.id,
        req.query.environment || "development",
      ),
    ),
  );
  app.put("/api/projects/:id/cloudbase/auth-settings", async (req, res) =>
    res.json(await updateCloudbaseAuthSettings(service, req.user, req.params.id, req.body || {})),
  );
  app.get("/api/projects/:id/cloudbase/admin-account", async (req, res) =>
    res.json(
      await readCloudbaseAdminAccount(
        service,
        req.user,
        req.params.id,
        req.query.environment || "development",
      ),
    ),
  );
  app.put("/api/projects/:id/cloudbase/admin-account", async (req, res) =>
    res.json(await saveCloudbaseAdminAccount(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/functions/:functionName/invoke", async (req, res) =>
    res.json(
      await invokeCloudbaseFunction(service, req.user, req.params.id, {
        ...(req.body || {}),
        name: req.params.functionName,
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/functions/:functionName/logs", async (req, res) =>
    res.json(
      await searchCloudbaseFunctionLogs(service, req.user, req.params.id, {
        ...req.query,
        name: req.params.functionName,
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/environments", async (req, res) =>
    res.json(await readCloudbaseEnvironments(service, req.user, req.params.id)),
  );
  app.get("/api/projects/:id/cloudbase/account-environments", async (req, res) =>
    res.json(await listCloudbaseAccountEnvironments(service, req.user, req.params.id)),
  );
  const readAdminProductionAddress = async (req, res) =>
    res.json(await readAdminProductionUrl(service, req.user, req.params.id));
  app.get("/api/projects/:id/cloudbase/admin-production-url", readAdminProductionAddress);
  app.get("/api/projects/:id/cloudbase/admin-experience-url", readAdminProductionAddress);
  app.get("/api/projects/:id/cloudbase/functions", async (req, res) =>
    res.json(
      await listCloudbaseFunctions(service, req.user, req.params.id, {
        environment: req.query.environment,
      }),
    ),
  );
  app.post("/api/projects/:id/cloudbase/functions/:functionName/timers", async (req, res) =>
    res
      .status(201)
      .json(
        await createCloudbaseTimer(
          service,
          req.user,
          req.params.id,
          req.params.functionName,
          req.body || {},
        ),
      ),
  );
  app.delete(
    "/api/projects/:id/cloudbase/functions/:functionName/timers/:triggerName",
    async (req, res) =>
      res.json(
        await deleteCloudbaseTimer(
          service,
          req.user,
          req.params.id,
          req.params.functionName,
          req.params.triggerName,
          { environment: req.query.environment },
        ),
      ),
  );
  app.get("/api/projects/:id/cloudbase/collections", async (req, res) =>
    res.json(
      await listCloudbaseCollections(service, req.user, req.params.id, {
        environment: req.query.environment,
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/storage/files", async (req, res) =>
    res.json(
      await listCloudbaseFiles(service, req.user, req.params.id, {
        environment: req.query.environment,
        cloudPath: req.query.path,
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/storage/download", async (req, res) => {
    const result = await getCloudbaseFileDownload(service, req.user, req.params.id, {
      environment: req.query.environment,
      cloudPath: req.query.path,
    });
    res.redirect(302, result.url);
  });
  app.post("/api/projects/:id/cloudbase/databases/query", async (req, res) =>
    res.json(await queryCloudbaseDocuments(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/databases/add", async (req, res) =>
    res
      .status(201)
      .json(await addCloudbaseDocument(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/databases/update", async (req, res) =>
    res.json(await updateCloudbaseDocument(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/databases/remove", async (req, res) =>
    res.json(await removeCloudbaseDocument(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/upload", async (req, res) => {
    const body = req.body || {};
    const content = body.contentBase64
      ? Buffer.from(String(body.contentBase64), "base64")
      : Buffer.from(String(body.content ?? ""), "utf8");
    res.status(201).json(
      await uploadCloudbaseFile(service, req.user, req.params.id, {
        environment: body.environment,
        cloudPath: body.cloudPath,
        content,
      }),
    );
  });
  app.post("/api/projects/:id/cloudbase/storage/urls", async (req, res) =>
    res.json(await cloudbaseFileUrls(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/delete", async (req, res) =>
    res.json(await deleteCloudbaseFiles(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/directory", async (req, res) =>
    res
      .status(201)
      .json(await createCloudbaseDirectory(service, req.user, req.params.id, req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/delete-entry", async (req, res) =>
    res.json(await deleteCloudbaseStorageEntry(service, req.user, req.params.id, req.body || {})),
  );
}
