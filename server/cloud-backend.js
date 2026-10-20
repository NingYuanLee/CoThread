/**
 * CloudBase 的唯一对外门。
 *
 * 路由、Agent 工具、发布执行、配置校验和 Admin 预览只从这里进入云能力。
 * SDK 与管理面调用留在 cloudbase.js、cloudbase-functions.js、cloudbase-hosting.js。
 * 微信上传、Dimina 编译、发布审批状态机不经过这里。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export {
  assertAgentEnvironment,
  ensureCloudbasePublishableKey,
  addCloudbaseDocument,
  cloudbaseFileUrls,
  createCloudbaseDirectory,
  deleteCloudbaseFiles,
  deleteCloudbaseStorageEntry,
  ensureCloudbaseCollection,
  getCloudbaseFileDownload,
  listCloudbaseCollections,
  listCloudbaseFiles,
  queryCloudbaseDocuments,
  readCloudbaseAdminAccount,
  readCloudbaseAuthSettings,
  assertCredentialListsEnvironments,
  assertCloudbaseEnvironmentsMatchApp,
  listCloudbaseAccountEnvironments,
  presentAccountEnvironments,
  readCloudbaseEnvironments,
  removeCloudbaseDocument,
  resetCloudbaseClients,
  saveCloudbaseAdminAccount,
  searchCloudbaseFunctionLogs,
  updateCloudbaseAuthSettings,
  updateCloudbaseDocument,
  uploadCloudbaseFile,
  invokeCloudbaseFunction,
  classifyCloudbaseCredential,
  cloudbaseAuthTokenGuidance,
} from "./cloudbase.js";

export {
  createCloudbaseTimer,
  deleteCloudbaseTimer,
  deployDevelopmentCloudbaseFunction,
  listCloudbaseFunctions,
  promoteCloudbaseFunction,
} from "./cloudbase-functions.js";

export { deployAdminHosting, readAdminProductionUrl } from "./cloudbase-hosting.js";

/** URL path Admin 预览用来提供平台自带的浏览器 SDK，不放进 Admin 源码区。 */
export const CLOUD_BROWSER_SDK_ASSET = "sdk/cloudbase.esm.js";

const browserSdkPath = resolve(import.meta.dirname, "../public/sdk/cloudbase.esm.js");
let browserSdk;

/** Platform copy of the browser SDK. Callers serve it; they do not know the file path. */
export function readCloudBrowserSdk() {
  if (!browserSdk) {
    browserSdk = readFileSync(browserSdkPath);
    if (!browserSdk.length) throw new Error("CloudBase 浏览器 SDK bundle 为空");
  }
  return browserSdk;
}
