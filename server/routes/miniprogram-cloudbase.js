/**
 * 小程序与 CloudBase 域：源码与配置、密钥、鉴权配置、预览与发布，以及云环境的数据与存储操作。
 * 注册点与原先内联时一致：在鉴权中间件之后、末尾 404 之前。
 */
import { z } from "zod/v3";
import { query } from "../db.js";
import {
  deleteProjectGitRemote,
  listPlatformRepositories,
  listProjectCodeConfig,
  revealProjectCodeConnectorToken,
  syncPlatformScope,
  upsertProjectCodeConnector,
} from "../project-code-sources.js";
import {
  deleteProjectMiniProgramSecret,
  readProjectMiniProgramConfig,
  saveAdminProductionConfig,
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
  verifyProjectMiniProgramConfig,
} from "../miniprogram-config.js";
import {
  readMiniprogramAuthConfig,
  saveMiniprogramAuthConfig,
  saveMiniprogramPublishableKey,
} from "../miniprogram-auth-config.js";
import {
  buildMiniprogramPreview,
  listMiniprogramBuilds,
  readMiniprogramBuild,
  readMiniprogramPreviewMeta,
  readMiniprogramResource,
} from "../miniprogram-build.js";
import { publishMiniprogramSourceFile } from "../miniprogram-workspace.js";
import {
  listMiniprogramDevServers,
  proxyDevServerRequest,
  recycleIdleDevServers,
  registerMiniprogramDevServer,
  startMiniprogramDevServer,
  stopMiniprogramDevServer,
  updateMiniprogramDevServer,
} from "../miniprogram-dev-server.js";
import { readAdminProductionUrl } from "../cloudbase-hosting.js";
import {
  addCloudbaseDocument,
  cloudbaseFileUrls,
  createCloudbaseDirectory,
  deleteCloudbaseFiles,
  deleteCloudbaseStorageEntry,
  queryCloudbaseDocuments,
  readCloudbaseEnvironments,
  removeCloudbaseDocument,
  resetCloudbaseClients,
  getCloudbaseFileDownload,
  listCloudbaseCollections,
  listCloudbaseFiles,
  updateCloudbaseDocument,
  uploadCloudbaseFile,
  ensureCloudbasePublishableKey,
  readCloudbaseAuthSettings,
  updateCloudbaseAuthSettings,
  readCloudbaseAdminAccount,
  saveCloudbaseAdminAccount,
  invokeCloudbaseFunction,
  searchCloudbaseFunctionLogs,
} from "../cloudbase.js";
import {
  createCloudbaseTimer,
  deleteCloudbaseTimer,
  listCloudbaseFunctions,
} from "../cloudbase-functions.js";
import {
  listMiniprogramDeployments,
  previewMiniprogram,
  readMiniprogramDeployment,
  uploadMiniprogram,
} from "../wechat-ci.js";
import {
  approveReleaseApplication,
  approveReleaseRequest,
  cancelReleaseApplication,
  cancelReleaseRequest,
  listReleaseApplications,
  listReleaseRequests,
  readReleaseRequest,
  rejectReleaseApplication,
  rejectReleaseRequest,
  submitReleaseApplication,
  submitReleaseRequest,
} from "../release-requests.js";
import { executeRelease } from "../release-executor.js";

export function registerMiniprogramCloudbaseRoutes(app, { db, service }) {
  app.get("/api/projects/:id/code-connectors", async (req, res) =>
    res.json(await listProjectCodeConfig(service, req.user, req.params.id)),
  );
  app.put("/api/projects/:id/code-connectors/:kind", async (req, res) =>
    res.json(
      await upsertProjectCodeConnector(service, req.user, req.params.id, {
        ...req.body,
        kind: req.params.kind,
      }),
    ),
  );
  app.get("/api/projects/:id/code-connectors/:kind/token", async (req, res) =>
    res.json(
      await revealProjectCodeConnectorToken(service, req.user, req.params.id, req.params.kind),
    ),
  );
  app.get("/api/projects/:id/code-connectors/:kind/repositories", async (req, res) =>
    res.json(
      await listPlatformRepositories(service, req.user, req.params.id, req.params.kind, {
        search: req.query.search,
      }),
    ),
  );
  app.put("/api/projects/:id/code-connectors/:kind/scope", async (req, res) =>
    res.json(await syncPlatformScope(service, req.user, req.params.id, req.params.kind, req.body)),
  );
  app.delete("/api/projects/:id/git-remotes/:remoteId", async (req, res) =>
    res.json(await deleteProjectGitRemote(service, req.user, req.params.id, req.params.remoteId)),
  );
  app.get("/api/projects/:id/miniprogram-config", async (req, res) =>
    res.json(await readProjectMiniProgramConfig(service, req.user, req.params.id)),
  );
  app.put("/api/projects/:id/miniprogram-config", async (req, res) =>
    res.json(await saveProjectMiniProgramConfig(service, req.user, req.params.id, req.body)),
  );
  const saveAdminProduction = async (req, res) =>
    res.json(await saveAdminProductionConfig(service, req.user, req.params.id, req.body));
  app.put("/api/projects/:id/miniprogram/admin-production", saveAdminProduction);
  // Compatibility for clients opened before Admin experience and production were unified.
  app.put("/api/projects/:id/miniprogram/admin-experience", saveAdminProduction);
  app.get("/api/projects/:id/miniprogram-auth-config", async (req, res) =>
    res.json(
      await readMiniprogramAuthConfig(service, req.user, req.params.id, {
        environment: req.query.environment,
      }),
    ),
  );
  app.put("/api/projects/:id/miniprogram-auth-config", async (req, res) =>
    res.json(await saveMiniprogramAuthConfig(service, req.user, req.params.id, req.body || {})),
  );
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
  app.put("/api/projects/:id/miniprogram-auth-config/publishable-key", async (req, res) => {
    await service.member(req.user, req.params.id, true, service.db, true);
    const environment = req.body?.environment;
    await saveMiniprogramPublishableKey(
      service.db,
      req.params.id,
      environment,
      req.body?.cloudbasePublishableKey,
      req.user.id,
    );
    res.json(await readMiniprogramAuthConfig(service, req.user, req.params.id, { environment }));
  });
  app.post("/api/projects/:id/miniprogram-auth-config/publishable-key", async (req, res) => {
    const environment = req.body?.environment || "development";
    await service.member(req.user, req.params.id, true, service.db, true);
    const key = await ensureCloudbasePublishableKey(service, req.params.id, environment);
    await saveMiniprogramPublishableKey(
      service.db,
      req.params.id,
      environment,
      key.publishableKey,
      req.user.id,
    );
    res.json({
      ...(await readMiniprogramAuthConfig(service, req.user, req.params.id, { environment })),
      publishableKeyCreated: key.created,
    });
  });
  app.post("/api/projects/:id/miniprogram-config/verify", async (req, res) =>
    res.json(await verifyProjectMiniProgramConfig(service, req.user, req.params.id)),
  );
  app.put("/api/projects/:id/miniprogram-secrets/:kind", async (req, res) => {
    const result = await saveProjectMiniProgramSecret(
      service,
      req.user,
      req.params.id,
      req.params.kind,
      req.body,
    );
    // Cached CloudBase clients hold the previous credential.
    resetCloudbaseClients(req.params.id);
    res.json(result);
  });
  app.delete("/api/projects/:id/miniprogram-secrets/:kind", async (req, res) => {
    const result = await deleteProjectMiniProgramSecret(
      service,
      req.user,
      req.params.id,
      req.params.kind,
    );
    resetCloudbaseClients(req.params.id);
    res.json(result);
  });
  app.post("/api/projects/:id/miniprogram/builds", async (req, res) =>
    res.status(202).json(
      await buildMiniprogramPreview(service, req.user, req.params.id, {
        force: Boolean(req.body?.force),
      }),
    ),
  );
  app.get("/api/projects/:id/miniprogram/builds", async (req, res) =>
    res.json(
      await listMiniprogramBuilds(service, req.user, req.params.id, {
        kind: req.query.kind || "app_preview",
        limit: req.query.limit,
      }),
    ),
  );
  app.get("/api/projects/:id/miniprogram/builds/:buildId", async (req, res) =>
    res.json(await readMiniprogramBuild(service, req.user, req.params.id, req.params.buildId)),
  );
  app.get("/api/projects/:id/miniprogram/dev-servers", async (req, res) => {
    await recycleIdleDevServers(db).catch(() => {});
    res.json(await listMiniprogramDevServers(service, req.user, req.params.id));
  });
  app.post("/api/projects/:id/miniprogram/dev-servers", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    res
      .status(201)
      .json(await registerMiniprogramDevServer(service, req.user, req.params.id, req.body));
  });
  app.post("/api/projects/:id/miniprogram/dev-servers/start", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    const serverId = req.body?.serverId ? z.string().uuid().parse(req.body.serverId) : null;
    res.json(await startMiniprogramDevServer(service, req.params.id, serverId));
  });
  app.patch("/api/projects/:id/miniprogram/dev-servers/:serverId", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    res.json(
      await updateMiniprogramDevServer(service, req.params.id, req.params.serverId, req.body),
    );
  });
  app.delete("/api/projects/:id/miniprogram/dev-servers/:serverId", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    res.json(await stopMiniprogramDevServer(service, req.params.id, req.params.serverId));
  });
  const proxyDevServer = async (req, res) => {
    try {
      await service.member(req.user, req.params.id, false);
    } catch {
      return res.status(403).json({ error: "无权访问该项目" });
    }
    return proxyDevServerRequest(service, req.params.id, req.params.serverId, req, res);
  };
  app.all("/api/projects/:id/miniprogram/dev-servers/:serverId/proxy", proxyDevServer);
  app.all("/api/projects/:id/miniprogram/dev-servers/:serverId/proxy/*assetPath", proxyDevServer);
  app.get("/api/projects/:id/miniprogram/deployments", async (req, res) =>
    res.json(
      await listMiniprogramDeployments(service, req.user, req.params.id, {
        limit: req.query.limit,
      }),
    ),
  );
  app.get("/api/projects/:id/miniprogram/deployments/:deploymentId", async (req, res) =>
    res.json(
      await readMiniprogramDeployment(service, req.user, req.params.id, req.params.deploymentId),
    ),
  );
  // 发布审批流：申请 → 批准（即执行）→ 记录。权限判定在 release-requests.js 内，路由只做转发。
  app.post("/api/projects/:id/miniprogram/release-requests", async (req, res) =>
    res
      .status(201)
      .json(await submitReleaseRequest(service, req.user, req.params.id, req.body || {})),
  );
  app.get("/api/projects/:id/miniprogram/release-requests", async (req, res) =>
    res.json(
      await listReleaseRequests(service, req.user, req.params.id, { limit: req.query.limit }),
    ),
  );
  app.get("/api/projects/:id/miniprogram/release-requests/:requestId", async (req, res) =>
    res.json(await readReleaseRequest(service, req.user, req.params.id, req.params.requestId)),
  );
  app.post("/api/projects/:id/miniprogram/release-requests/:requestId/approve", async (req, res) =>
    res.json(
      await approveReleaseRequest(service, req.user, req.params.id, req.params.requestId, {
        note: req.body?.note,
        // 批准即执行：执行入口在此注入，状态机只负责授权、CAS 与记录。
        execute: (request) => executeRelease(service, req.user, req.params.id, request),
      }),
    ),
  );
  app.post("/api/projects/:id/miniprogram/release-requests/:requestId/reject", async (req, res) =>
    res.json(
      await rejectReleaseRequest(service, req.user, req.params.id, req.params.requestId, {
        reason: req.body?.reason,
      }),
    ),
  );
  app.post("/api/projects/:id/miniprogram/release-requests/:requestId/cancel", async (req, res) =>
    res.json(await cancelReleaseRequest(service, req.user, req.params.id, req.params.requestId)),
  );
  app.post("/api/projects/:id/miniprogram/release-applications", async (req, res) =>
    res
      .status(201)
      .json(await submitReleaseApplication(service, req.user, req.params.id, req.body || {})),
  );
  app.get("/api/projects/:id/miniprogram/release-applications", async (req, res) =>
    res.json(
      await listReleaseApplications(service, req.user, req.params.id, { limit: req.query.limit }),
    ),
  );
  app.post(
    "/api/projects/:id/miniprogram/release-applications/:applicationId/approve",
    async (req, res) =>
      res.json(
        await approveReleaseApplication(
          service,
          req.user,
          req.params.id,
          req.params.applicationId,
          {
            note: req.body?.note,
            execute: (request) => executeRelease(service, req.user, req.params.id, request),
          },
        ),
      ),
  );
  app.post(
    "/api/projects/:id/miniprogram/release-applications/:applicationId/reject",
    async (req, res) =>
      res.json(
        await rejectReleaseApplication(service, req.user, req.params.id, req.params.applicationId, {
          reason: req.body?.reason,
        }),
      ),
  );
  app.post(
    "/api/projects/:id/miniprogram/release-applications/:applicationId/cancel",
    async (req, res) =>
      res.json(
        await cancelReleaseApplication(service, req.user, req.params.id, req.params.applicationId),
      ),
  );
  app.post("/api/projects/:id/miniprogram/wechat/preview", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    res
      .status(201)
      .json(await previewMiniprogram(service, req.user, req.params.id, req.body || {}));
  });
  app.post("/api/projects/:id/miniprogram/wechat/upload", async (req, res) => {
    await service.member(req.user, req.params.id, true, db);
    res.status(201).json(await uploadMiniprogram(service, req.user, req.params.id, req.body || {}));
  });
  app.get("/api/projects/:id/cloudbase/environments", async (req, res) =>
    res.json(await readCloudbaseEnvironments(service, req.user, req.params.id)),
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
  app.get("/api/projects/:id/miniprogram/preview-meta", async (req, res) =>
    res.json(await readMiniprogramPreviewMeta(service, req.user, req.params.id)),
  );
  app.put("/api/projects/:id/miniprogram/source", async (req, res) => {
    await service.member(req.user, req.params.id, true, db, true);
    const body = req.body || {};
    const content = body.contentBase64
      ? Buffer.from(String(body.contentBase64), "base64")
      : Buffer.from(String(body.content ?? ""), "utf8");
    res.status(201).json(
      await publishMiniprogramSourceFile(db, req.user, req.params.id, {
        area: body.area,
        path: body.path,
        mime: body.mime,
        note: body.note,
        content,
      }),
    );
  });
  app.get("/api/projects/:id/miniprogram/resources/:appId/*assetPath", async (req, res) => {
    let assetPath = req.params.assetPath || "";
    if (Array.isArray(assetPath)) assetPath = assetPath.join("/");
    const file = await readMiniprogramResource(
      service,
      req.user,
      req.params.id,
      req.params.appId,
      decodeURIComponent(String(assetPath)),
    );
    if (!file) return res.status(404).json({ error: "资源不存在" });
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.send(file.content);
  });
}
