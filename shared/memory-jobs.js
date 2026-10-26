/**
 * 五类记忆作业的唯一事实源：触发、总结口径、可用工具、完成标准、失败补救。
 * 这里只描述口径；真正执行仍走各自实现，调优时先改这里，再改实现。
 */
export const MEMORY_JOBS = Object.freeze([
  {
    key: "member_memory",
    label: "关键发言",
    subject: "utterance",
    queue: "agent_member_memory_queue",
    trigger:
      "成员有新发言：agent_member_memory_queue 里 pending_through_sequence 落后于已读到序号；一次最多 50 人，没有新发言的成员直接出队。不是每条发言都形成记忆，只保留关键判断、重要决策、风险提醒、需求澄清、承诺分工或经验分享。",
    prompt:
      "读这名成员的身份、签名、旧发言记忆、新发言及其上文背景。只记关键发言的总结和影响，不评价性格或能力；为每条关键发言归入受控二级类型，输出背景、要点、立场与主张、承诺与待办、引用提示。原话只通过消息出处保留。",
    tools: ["项目成员与消息（只读）", "该成员旧发言记忆（只读）"],
    completion:
      "每个有新发言的成员按需写/更新 subject=utterance 页面，带 about_user_id、受控 subtype 和消息出处，并推进已读序号；没有关键内容时只推进序号，不制造空记忆。",
    failure:
      "失败的成员延后 60 秒；模型 503 / 超时延后 300 秒；run 记 failed 可重试；不阻塞其他成员。",
    batch: 50,
  },
  {
    key: "document_memory",
    label: "主要文档",
    subject: "document",
    queue: "agent_document_memory_queue",
    trigger:
      "正式文件新版本进入 agent_document_memory_queue 且到期；每份正式文件都要判断是否值得形成主要文档记忆；压缩包、代码包先说明用途并列清单，图片需要视觉识别。",
    prompt:
      "总结这份正式文件是什么、用途、关键版本、变更意义、什么时候该看，并选择受控二级类型。压缩包说明用途并概括清单，图片识别画面与关键文字；有关联或成组文件时补共享摘要。正文必须是总结和升华，不复制原文，原始版本只通过出处保留。",
    tools: [
      "read_document（文本正文；二进制进沙箱后列目录）",
      "版本与文件夹元数据（只读）",
      "图片视觉能力",
    ],
    completion:
      "单文档记忆更新到当前版本，带受控 subtype，出处指向 document_version；组条目的成员清单和共享摘要同步更新。",
    failure:
      "非文本且无候选摘要只做一次 30 天兜底；解析失败降级为「类型 + 大小 + sha256 + 文件名」；失败延后 60 秒。",
    batch: 1,
  },
  {
    key: "task_memory",
    label: "重要任务",
    subject: "task",
    queue: null,
    trigger:
      "任务进入终态（completed / failed / cancelled / superseded）、发生重试、返工或阻塞；当前由 project_memory 结算顺带承接，不占独立队列。普通任务不单独形成记忆。",
    prompt:
      "只有关键交付、困难任务、阻塞任务、反复重做、失败任务或专项任务才单独立条，写清为什么重要、目标与约束、关键决策、结果、失败与代价、返工经验，并选择受控二级类型；普通任务合并成迭代任务分布。正文总结经验，不复制执行日志。",
    tools: ["任务与执行记录（只读）"],
    completion:
      "重要任务一条 + 每个迭代一条任务分布；每条带受控 subtype，口径固定（耗时取 created_at → finished_at，坑取执行记录 error）。",
    failure: "统计失败不写半条；下次结算整体重算；原始任务记录是唯一事实，记忆可重建。",
    batch: 0,
  },
  {
    key: "discussion_memory",
    label: "核心议题",
    subject: "discussion",
    queue: null,
    trigger:
      "迭代静默、累计新消息达到阈值（当前随 project_memory 候选推进）、出现决策信号、归档前；只有迭代群聊中的核心议题才成条。",
    prompt:
      "标题用议题；选择受控二级类型，写议题背景、参与者与观点、依据、已达成、仍在争、下一步与负责人及影响。群聊快照只作上下文和出处，不复制进正文；同一话题用 update 合并，不要重复建条。",
    tools: ["群聊消息（只读）", "任务与文档引用（只读）"],
    completion:
      "一条核心议题总结 + 受控 subtype + 参与者发言记忆的 relates 边 + thread/message 出处；话题归一键保证跨迭代合并。",
    failure: "失败保留候选，下次合并重算；话题归一键防止重复；连边失败不影响正文写入。",
    batch: 0,
  },
  {
    key: "project_memory",
    label: "里程碑",
    subject: "project",
    queue: "agent_project_memory_queue",
    trigger:
      "候选队列 ≥ 40 条、最久等待 ≥ 20 分钟、urgent（项目/成员/迭代变更、任务状态变更、正式文件新版本）或手动刷新。",
    prompt:
      "读候选与现有记忆索引；只做 create / update / dispute；正文必须是总结和升华后的项目知识，原始内容只作出处；每条选择合法的一级类型、受控二级类型；零产出合法。",
    tools: ["候选信号（只读）", "现有记忆索引（只读）"],
    completion: "结算写库并记一级类型、二级类型、出处与变更日志；只有实际有变更时才清队列。",
    failure: "失败保留队列可重试；update 只允许改 draft；重复确认走只读重算。",
    batch: 40,
  },
]);

export const MEMORY_JOB_KEYS = Object.freeze(MEMORY_JOBS.map((job) => job.key));

export function memoryJobSpec(key) {
  return MEMORY_JOBS.find((job) => job.key === key) || null;
}
