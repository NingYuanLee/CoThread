import { HttpError } from "./service.js";
import { uploadMiniprogram } from "./wechat-ci.js";
import { deployAdminHosting } from "./cloudbase-hosting.js";
import { promoteCloudbaseFunction } from "./cloudbase-functions.js";

/**
 * 发布审批流的执行入口。
 *
 * 状态机（server/release-requests.js）只负责「谁能批、什么时候有效、怎么记」，
 * 真正的发布动作集中在这里。这样做的两个原因：
 * 发布动作集中在这里，便于审计与替换。微信体验版上传不属于生产发布，
 * 由 Dimina预览中的直接上传入口处理。
 *
 * 约定：成功返回 deploymentId；失败抛出错误，由状态机记为 failed（不自动重试）。
 */
export async function executeRelease(service, actor, projectId, request) {
  if (!request || !request.target) throw new HttpError(400, "发布申请缺少目标");
  if (request.target === "wechat_upload") {
    // Compatibility for requests created before experience uploads became direct.
    const result = await uploadMiniprogram(service, actor, projectId, {
      version: request.version,
      desc: request.releaseNote || undefined,
    });
    return result.deploymentId;
  }
  if (request.target === "cloudbase_static") {
    const result = await deployAdminHosting(service, actor, projectId, request);
    return result.deploymentId;
  }
  if (request.target === "cloudbase_function") {
    const result = await promoteCloudbaseFunction(service, actor, projectId, request);
    return result.deploymentId;
  }
  throw new HttpError(400, `未知发布目标：${request.target}`);
}
