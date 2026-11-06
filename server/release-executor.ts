import { HttpError } from "./service.ts";
import { uploadMiniprogram } from "./wechat-ci.ts";
import { deployAdminHosting, promoteCloudbaseFunction } from "./cloud-backend.ts";

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
/** 发布申请。 */
type ReleaseRequest = {
  target?: string | null;
  version?: unknown;
  releaseNote?: string | null;
  [field: string]: unknown;
};

export async function executeRelease(
  service: unknown,
  actor: unknown,
  projectId: string,
  request: ReleaseRequest | null | undefined,
): Promise<unknown> {
  if (!request || !request.target) throw new HttpError(400, "发布申请缺少目标");
  if (request.target === "wechat_upload") {
    // Compatibility for requests created before experience uploads became direct.
    const result = await uploadMiniprogram(service as never, actor as never, projectId, {
      version: request.version,
      desc: request.releaseNote || undefined,
    });
    return result.deploymentId;
  }
  if (request.target === "cloudbase_static") {
    const result = await deployAdminHosting(service as never, actor as never, projectId, request);
    return result.deploymentId;
  }
  if (request.target === "cloudbase_function") {
    // 申请单只按这两个字段驱动云函数发布镜像；其余字段属于状态机自己记录的内容。
    const result = await promoteCloudbaseFunction(service as never, actor as never, projectId, {
      resourceName: request.resourceName,
      sourceHash: request.sourceHash,
    });
    return result.deploymentId;
  }
  throw new HttpError(400, `未知发布目标：${request.target}`);
}
