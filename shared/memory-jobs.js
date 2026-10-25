/**
 * 五类记忆作业的唯一事实源：触发、提示词、可用工具、完成标准、失败补救。
 * 这里只描述口径；真正执行仍走各自实现，调优时先改这里，再改实现。
 */
export const MEMORY_JOBS = Object.freeze([
  {
    key: "member_memory",
    label: "发言记忆",
    subject: "utterance",
    queue: "agent_member_memory_queue",
    trigger:
      "成员有新发言：agent_member_memory_queue 里 pending_through_sequence 落后于已读到序号；一次最多 50 人，没有新发言的成员直接出队。",
    prompt:
      "读这名成员的身份、签名、旧发言记忆和新发言。只记他说过什么、主张什么、承诺什么，不评价性格或能力；输出要点、立场与主张、承诺与待办、引用提示。",
    tools: ["项目成员与消息（只读）", "该成员旧发言记忆（只读）"],
    completion:
      "每个有新发言的成员写/更新一条 subject=utterance 页面，带 about_user_id 和消息出处，并推进已读序号。",
    failure:
      "失败的成员延后 60 秒；模型 503 / 超时延后 300 秒；run 记 failed 可重试；不阻塞其他成员。",
    batch: 50,
  },
  {
    key: "document_memory",
    label: "文档记忆",
    subject: "document",
    queue: "agent_document_memory_queue",
    trigger:
      "正式文件新版本进入 agent_document_memory_queue 且到期；非文本先看是否已有候选摘要；压缩包、代码包先列清单再写记忆。",
    prompt:
      "判断这份文档是什么、关键版本与变更要点、什么时候该看；二进制只记清单与入口（压缩包顶层文件、图片画面一句话），不复制内容；成组的代码/资料建立组条目。",
    tools: [
      "read_document（文本正文；二进制进沙箱后列目录）",
      "版本与文件夹元数据（只读）",
      "图片视觉能力",
    ],
    completion: "单文档记忆更新到当前版本，出处指向 document_version；组条目的成员清单同步增删。",
    failure:
      "非文本且无候选摘要只做一次 30 天兜底；解析失败降级为「类型 + 大小 + sha256 + 文件名」；失败延后 60 秒。",
    batch: 1,
  },
  {
    key: "task_memory",
    label: "任务记忆",
    subject: "task",
    queue: null,
    trigger:
      "任务进入终态（completed / failed / cancelled / superseded）、发生重试或返工；当前由 project_memory 结算顺带承接，不占独立队列。",
    prompt:
      "重要任务（失败过、重试过、返工、正式任务、耗时偏长）单独立条，写执行者类型、耗时、重试与失败原因、坑与返工；普通任务不逐条建，合并成一条迭代「任务分布」。",
    tools: ["任务与执行记录（只读）"],
    completion:
      "重要任务一条 + 每个迭代一条任务分布；口径固定（耗时取 created_at → finished_at，坑取执行记录 error）。",
    failure: "统计失败不写半条；下次结算整体重算；原始任务记录是唯一事实，记忆可重建。",
    batch: 0,
  },
  {
    key: "discussion_memory",
    label: "讨论记忆",
    subject: "discussion",
    queue: null,
    trigger:
      "迭代静默、累计新消息达到阈值（当前随 project_memory 候选推进）、出现决策信号、归档前；同一话题被至少两名成员讨论过才成条。",
    prompt:
      "标题用话题；写议题、参与者与观点、依据与来源、已达成、仍在争、下一步与负责人；同一话题用 update 合并，不要重复建条。",
    tools: ["群聊消息（只读）", "任务与文档引用（只读）"],
    completion:
      "一条讨论记忆 + 参与者发言记忆的 relates 边 + thread/message 出处；话题归一键保证跨迭代合并。",
    failure: "失败保留候选，下次合并重算；话题归一键防止重复；连边失败不影响正文写入。",
    batch: 0,
  },
  {
    key: "project_memory",
    label: "项目整体记忆",
    subject: "project",
    queue: "agent_project_memory_queue",
    trigger:
      "候选队列 ≥ 40 条、最久等待 ≥ 20 分钟、urgent（任务状态变更 / 正式文件新版本）或手动刷新。",
    prompt:
      "读候选与现有记忆索引；只做 create / update / dispute；零产出合法；subject 只能是 utterance/document/task/discussion/project；拿不准对象留空。",
    tools: ["候选信号（只读）", "现有记忆索引（只读）"],
    completion: "结算写库并记出处与变更日志；只有实际有变更时才清队列。",
    failure: "失败保留队列可重试；update 只允许改 draft；重复确认走只读重算。",
    batch: 40,
  },
]);

export const MEMORY_JOB_KEYS = Object.freeze(MEMORY_JOBS.map((job) => job.key));

export function memoryJobSpec(key) {
  return MEMORY_JOBS.find((job) => job.key === key) || null;
}
