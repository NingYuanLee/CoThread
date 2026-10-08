import { query } from "../server/db.js";
import { saveProjectMiniProgramSecret } from "../server/miniprogram-config.js";
import { publishMiniprogramSourceFile } from "../server/miniprogram-workspace.js";

const TEST_WECHAT_KEY = "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----";

/** 结构合法但内容虚构的私钥：`prepareRelease` 只校验 PEM 形状与可解析性。 */
export const TEST_WECHAT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCfakeKeyMaterialForTests
-----END PRIVATE KEY-----`;

/**
 * 铺一份最小小程序源码。
 *
 * 连接测试里用 `previewMiniprogram` 验证微信上传私钥，而它会先要求源码目录非空，
 * 否则直接以「源文件目录为空」失败，走不到 provider 调用。
 */
export async function seedMinimalMiniprogramApp(db, projectId, createdBy) {
  await publishMiniprogramSourceFile(db, { id: createdBy }, projectId, {
    area: "miniprogram_source",
    path: "app.json",
    content: Buffer.from(JSON.stringify({ pages: ["pages/index"] })),
  });
  await publishMiniprogramSourceFile(db, { id: createdBy }, projectId, {
    area: "miniprogram_source",
    path: "app.js",
    content: Buffer.from("App({ onLaunch() {} });\n"),
  });
}

/**
 * 让项目的小程序工作区进入"已启用"状态。
 *
 * `computeConfigStatus` 要求 AppID + development 环境 + 两个凭据 + 一次连接测试通过
 * （`last_verified_at`）才算 `verified`；`deployAdminHosting` / `buildMiniprogramPreview`
 * 等入口都以 `runtime.enabled` 作为 409 守卫。多个既有用例只写了配置和云端凭据，
 * 夹具因此停在 `credential_expired`，与生产逻辑无关。
 *
 * 只补缺失项：已存在的凭据不覆盖，便于用例继续验证"凭据失效"分支。
 * `verify: false` 时只补凭据、不写验证时间。
 */
export async function markMiniProgramWorkspaceVerified(
  service,
  owner,
  projectId,
  { verify = true, credentials = true } = {},
) {
  const db = service.db;
  const rows = await query(db, "SELECT kind FROM project_miniprogram_secrets WHERE project_id=?", [
    projectId,
  ]);
  const kinds = new Set(rows.map((row) => row.kind));
  if (credentials && !kinds.has("wechat_upload_key"))
    await saveProjectMiniProgramSecret(service, owner, projectId, "wechat_upload_key", {
      value: TEST_WECHAT_KEY,
    });
  if (credentials && !kinds.has("cloudbase_credential"))
    await saveProjectMiniProgramSecret(service, owner, projectId, "cloudbase_credential", {
      secretId: "AKIDtest0000000000000",
      secretKey: "test-cloudbase-secret",
    });
  if (verify)
    await query(
      db,
      "UPDATE project_miniprogram_config SET last_verified_at=UTC_TIMESTAMP(3),last_verify_error=NULL WHERE project_id=?",
      [projectId],
    );
}
