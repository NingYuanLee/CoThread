/**
 * 记忆即 wiki 的一种：正文统一 Markdown，存 wiki_pages。
 * 五类记忆是「记的是谁」的类型标签，不是目录层级；条目之间用 memory_relations 织网。
 */
export const MEMORY_SUBJECTS = Object.freeze([
  "utterance",
  "document",
  "task",
  "discussion",
  "project",
]);

export const MEMORY_SUBJECT_LABELS = Object.freeze({
  utterance: "发言记忆",
  document: "文档记忆",
  task: "任务记忆",
  discussion: "讨论记忆",
  project: "项目整体记忆",
});

/**
 * 讨论记忆是群体记忆：单位是「被多人讨论过的话题」，不是事，也不绑定一个迭代。
 * 话题可以是新闻、想法、知识、原因或决策；它用关系边连到参与的发言记忆与相关对象。
 */
export const MEMORY_PROCESS_SUBJECT = "discussion";

/** 发言记忆按项目成员维度存，about_user_id 指向「这条记忆说的是谁」。 */
export const MEMORY_ABOUT_SUBJECTS = Object.freeze(["utterance"]);

export const MEMORY_RELATION_LABELS = Object.freeze({
  relates: "关联",
  derives: "继承",
  supersedes: "替代",
});

/** 只允许单向、有方向的边；relates 双向但不重复存反向边。 */
export const MEMORY_DIRECTED_RELATIONS = Object.freeze(["derives", "supersedes"]);

/**
 * 发言记忆只记「他说过什么」，不做人格评价：
 * 要点、立场与主张、承诺与待办、引用提示。骨架是写作提示，不是字段校验。
 */
export const MEMORY_SKELETONS = Object.freeze({
  utterance: ["要点", "立场与主张", "承诺与待办", "引用提示"],
  document: ["是什么", "关键版本", "变更要点", "何时该看"],
  task: ["目标与约束", "决策", "结果", "失败与重试", "坑与成本", "返工"],
  discussion: ["议题", "参与者与观点", "依据与来源", "已达成", "仍在争", "下一步与负责人"],
  project: ["是什么", "现在到哪", "关键决策", "风险与依赖"],
});

export function isMemorySubject(value) {
  return MEMORY_SUBJECTS.includes(value);
}

export function memorySubjectLabel(subject) {
  return MEMORY_SUBJECT_LABELS[subject] || "";
}

/** 只有发言记忆需要 about_user_id。 */
export function subjectNeedsAboutUser(subject) {
  return MEMORY_ABOUT_SUBJECTS.includes(subject);
}

/** 生成一条空骨架的 Markdown 正文，供老翁在无既有内容时起步。 */
export function memorySkeleton(subject) {
  const sections = MEMORY_SKELETONS[subject] || [];
  return sections.map((name) => `## ${name}\n`).join("\n");
}
