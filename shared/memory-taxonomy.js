/** 受控的二级记忆类型；一级 subject 仍是稳定的产品导航。 */
export const MEMORY_SUBTYPES = Object.freeze({
  project: Object.freeze([
    "project_origin",
    "member_change",
    "iteration_created",
    "iteration_context_changed",
    "iteration_archived",
    "phase_change",
  ]),
  discussion: Object.freeze([
    "requirements",
    "technical_decision",
    "product_decision",
    "risk_dispute",
    "problem_review",
    "cross_iteration_topic",
  ]),
  task: Object.freeze([
    "critical_delivery",
    "difficult_task",
    "blocked_task",
    "rework_task",
    "failed_task",
    "special_task",
  ]),
  utterance: Object.freeze([
    "key_judgment",
    "decision",
    "risk_alert",
    "requirement_clarification",
    "commitment",
    "experience",
  ]),
  document: Object.freeze([
    "requirements_document",
    "design_document",
    "technical_document",
    "api_document",
    "test_material",
    "operations_material",
    "reference_material",
    "resource_package",
    "image_material",
  ]),
});

export const MEMORY_SUBTYPE_LABELS = Object.freeze({
  project_origin: "项目初创",
  member_change: "成员调整",
  iteration_created: "迭代创建",
  iteration_context_changed: "目标背景变更",
  iteration_archived: "迭代归档",
  phase_change: "阶段切换",
  requirements: "需求讨论",
  technical_decision: "技术决策",
  product_decision: "产品决策",
  risk_dispute: "风险争议",
  problem_review: "问题复盘",
  cross_iteration_topic: "跨迭代议题",
  critical_delivery: "关键交付",
  difficult_task: "困难任务",
  blocked_task: "阻塞任务",
  rework_task: "返工任务",
  failed_task: "失败任务",
  special_task: "专项任务",
  key_judgment: "关键判断",
  decision: "重要决策",
  risk_alert: "风险提醒",
  requirement_clarification: "需求澄清",
  commitment: "承诺与分工",
  experience: "经验分享",
  requirements_document: "需求文档",
  design_document: "设计文档",
  technical_document: "技术方案",
  api_document: "接口文档",
  test_material: "测试材料",
  operations_material: "运营材料",
  reference_material: "参考资料",
  resource_package: "资源包",
  image_material: "图片资料",
});

export const DEFAULT_MEMORY_SUBTYPES = Object.freeze({
  project: "phase_change",
  discussion: "cross_iteration_topic",
  task: "special_task",
  utterance: "experience",
  document: "reference_material",
});

export function isMemorySubtype(subject, subtype) {
  return typeof subtype === "string" && (MEMORY_SUBTYPES[subject] || []).includes(subtype);
}
