import { HttpError } from "./service.js";
import { uploadMiniprogram } from "./wechat-ci.js";
import { deployAdminHosting } from "./cloudbase-hosting.js";

/**
 * 发布审批流的执行入口。
 *
 * 状态机（server/release-requests.js）只负责「谁能批、什么时候有效、怎么记」，
 * 真正的发布动作集中在这里。这样做的两个原因：
 *  1. 发布动作只有一个调用点，便于审计与替换（P7 的 Admin 托管发布接在这里）。
 *  2. `uploadMiniprogram` 可以强制要求携带审批授权，杜绝绕过审批流的旁路。
 *
 * 约定：成功返回 deploymentId；失败抛出错误，由状态机记为 failed（不自动重试）。
 */
export async function executeRelease(service, actor, projectId, request) {
  if (!request || !request.target) throw new HttpError(400, "发布申请缺少目标");
  if (request.target === "wechat_upload") {
    const result = await uploadMiniprogram(service, actor, projectId, {
      version: request.version,
      desc: request.releaseNote || undefined,
      authorization: { requestId: request.id, approvedBy: actor.id },
    });
    return result.deploymentId;
  }
  if (request.target === "cloudbase_static" || request.target === "cloudbase_hosted") {
    const result = await deployAdminHosting(service, actor, projectId, request);
    return result.deploymentId;
  }
  throw new HttpError(400, `未知发布目标：${request.target}`);
}
