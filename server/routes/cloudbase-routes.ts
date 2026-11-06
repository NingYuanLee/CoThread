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
} from "../cloud-backend.ts";
import type { Express, Request, Response } from "express";
import type { Service } from "../service.ts";

/** 路由注册时注入的依赖。 */
type CloudbaseRouteDeps = { service: Service };

/**
 * 查询串里的单值文本参数：数组 / 对象形态一律视为未提供。
 * 只有下游要求 `string | null | undefined` 时才用，别处保持原来的透传。
 */
function queryText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function registerCloudbaseRoutes(app: Express, { service }: CloudbaseRouteDeps) {
  app.get("/api/projects/:id/cloudbase/auth-settings", async (req: Request, res: Response) =>
    res.json(
      await readCloudbaseAuthSettings(
        service,
        req.user,
        String(req.params.id),
        String(req.query.environment || "development"),
      ),
    ),
  );
  app.put("/api/projects/:id/cloudbase/auth-settings", async (req: Request, res: Response) =>
    res.json(
      await updateCloudbaseAuthSettings(service, req.user, String(req.params.id), req.body || {}),
    ),
  );
  app.get("/api/projects/:id/cloudbase/admin-account", async (req: Request, res: Response) =>
    res.json(
      await readCloudbaseAdminAccount(
        service,
        req.user,
        String(req.params.id),
        String(req.query.environment || "development"),
      ),
    ),
  );
  app.put("/api/projects/:id/cloudbase/admin-account", async (req: Request, res: Response) =>
    res.json(
      await saveCloudbaseAdminAccount(service, req.user, String(req.params.id), req.body || {}),
    ),
  );
  app.post(
    "/api/projects/:id/cloudbase/functions/:functionName/invoke",
    async (req: Request, res: Response) =>
      res.json(
        await invokeCloudbaseFunction(service, req.user, String(req.params.id), {
          ...(req.body || {}),
          name: String(req.params.functionName),
        }),
      ),
  );
  app.get(
    "/api/projects/:id/cloudbase/functions/:functionName/logs",
    async (req: Request, res: Response) =>
      res.json(
        await searchCloudbaseFunctionLogs(service, req.user, String(req.params.id), {
          ...req.query,
          name: String(req.params.functionName),
        }),
      ),
  );
  app.get("/api/projects/:id/cloudbase/environments", async (req: Request, res: Response) =>
    res.json(await readCloudbaseEnvironments(service, req.user, String(req.params.id))),
  );
  app.get("/api/projects/:id/cloudbase/account-environments", async (req: Request, res: Response) =>
    res.json(await listCloudbaseAccountEnvironments(service, req.user, String(req.params.id))),
  );
  const readAdminProductionAddress = async (req: Request, res: Response) =>
    res.json(await readAdminProductionUrl(service as never, req.user, String(req.params.id)));
  app.get("/api/projects/:id/cloudbase/admin-production-url", readAdminProductionAddress);
  app.get("/api/projects/:id/cloudbase/admin-experience-url", readAdminProductionAddress);
  app.get("/api/projects/:id/cloudbase/functions", async (req: Request, res: Response) =>
    res.json(
      await listCloudbaseFunctions(service, req.user, String(req.params.id), {
        environment: req.query.environment,
      }),
    ),
  );
  app.post(
    "/api/projects/:id/cloudbase/functions/:functionName/timers",
    async (req: Request, res: Response) =>
      res
        .status(201)
        .json(
          await createCloudbaseTimer(
            service,
            req.user,
            String(req.params.id),
            String(req.params.functionName),
            req.body || {},
          ),
        ),
  );
  app.delete(
    "/api/projects/:id/cloudbase/functions/:functionName/timers/:triggerName",
    async (req: Request, res: Response) =>
      res.json(
        await deleteCloudbaseTimer(
          service,
          req.user,
          String(req.params.id),
          String(req.params.functionName),
          String(req.params.triggerName),
          { environment: req.query.environment },
        ),
      ),
  );
  app.get("/api/projects/:id/cloudbase/collections", async (req: Request, res: Response) =>
    res.json(
      await listCloudbaseCollections(service, req.user, String(req.params.id), {
        environment: queryText(req.query.environment),
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/storage/files", async (req: Request, res: Response) =>
    res.json(
      await listCloudbaseFiles(service, req.user, String(req.params.id), {
        environment: queryText(req.query.environment),
        cloudPath: req.query.path,
      }),
    ),
  );
  app.get("/api/projects/:id/cloudbase/storage/download", async (req: Request, res: Response) => {
    const result = await getCloudbaseFileDownload(service, req.user, String(req.params.id), {
      environment: queryText(req.query.environment),
      cloudPath: req.query.path,
    });
    res.redirect(302, result.url);
  });
  app.post("/api/projects/:id/cloudbase/databases/query", async (req: Request, res: Response) =>
    res.json(
      await queryCloudbaseDocuments(service, req.user, String(req.params.id), req.body || {}),
    ),
  );
  app.post("/api/projects/:id/cloudbase/databases/add", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await addCloudbaseDocument(service, req.user, String(req.params.id), req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/databases/update", async (req: Request, res: Response) =>
    res.json(
      await updateCloudbaseDocument(service, req.user, String(req.params.id), req.body || {}),
    ),
  );
  app.post("/api/projects/:id/cloudbase/databases/remove", async (req: Request, res: Response) =>
    res.json(
      await removeCloudbaseDocument(service, req.user, String(req.params.id), req.body || {}),
    ),
  );
  app.post("/api/projects/:id/cloudbase/storage/upload", async (req: Request, res: Response) => {
    const body = req.body || {};
    const content = body.contentBase64
      ? Buffer.from(String(body.contentBase64), "base64")
      : Buffer.from(String(body.content ?? ""), "utf8");
    res.status(201).json(
      await uploadCloudbaseFile(service, req.user, String(req.params.id), {
        environment: body.environment,
        cloudPath: body.cloudPath,
        content,
      }),
    );
  });
  app.post("/api/projects/:id/cloudbase/storage/urls", async (req: Request, res: Response) =>
    res.json(await cloudbaseFileUrls(service, req.user, String(req.params.id), req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/delete", async (req: Request, res: Response) =>
    res.json(await deleteCloudbaseFiles(service, req.user, String(req.params.id), req.body || {})),
  );
  app.post("/api/projects/:id/cloudbase/storage/directory", async (req: Request, res: Response) =>
    res
      .status(201)
      .json(
        await createCloudbaseDirectory(service, req.user, String(req.params.id), req.body || {}),
      ),
  );
  app.post(
    "/api/projects/:id/cloudbase/storage/delete-entry",
    async (req: Request, res: Response) =>
      res.json(
        await deleteCloudbaseStorageEntry(service, req.user, String(req.params.id), req.body || {}),
      ),
  );
}
