/**
 * 四类记忆作业的唯一事实源：触发、总结口径、可用工具、完成标准、失败补救。
 * 核心议题与关键发言合为一条作业，仅产物分成议题、发言两类。
 * 这里只描述口径；真正执行仍走各自实现，调优时先改这里，再改实现。
 */
const MEMORY_JOB_ORDER = ["project_memory", "task_memory", "member_memory", "document_memory"];

export const MEMORY_JOBS = Object.freeze(
  [
    {
      key: "member_memory",
      label: "核心议题与关键发言",
      subject: "utterance",
      queue: "conversation_memory_queue",
      trigger:
        "群聊新消息按迭代入队，同一次联合分析同时产出核心议题与关键发言；静默 10 分钟或最久等待 1 小时触发，归档和手动操作可提前处理；每窗最多 40 条并限制文本量。",
      prompt:
        "读取新增发言、前文和相关旧记忆；按一条重要发言或同一成员的相关观点立条，只记录有出处支持的判断、承诺和提醒，不评价人格或能力。单人提出值得长期关注的问题也可成条，不等待多人参与或讨论结束；记录问题背景、参与者及观点、依据、结论或分歧和下一步，单人提出且未有结论时标记待讨论，后续依据新信息更新。",
      tools: ["项目内消息、记忆、任务和文档（只读）"],
      completion:
        "关键发言：每条记忆带成员、受控 subtype 和消息出处；核心议题：议题直接可检索，具有待讨论、讨论中、已有结论或暂缓状态，消息出处和变更可追溯，与共同出处的发言建立关系。两者分别保存和记录状态，零产出可成功，不覆盖旧页面。",
      failure:
        "失败候选保留并按退避自动重试，最多 5 次，仍失败则停止自动重试、等人工在「记忆作业」里重试；没有新增内容时不调用模型；已保存项不重复写入；消息或目标发生变化时停止覆盖并记录错误。",
      batch: 40,
    },
    {
      key: "project_memory",
      label: "项目进程",
      subject: "project",
      queue: "agent_project_memory_queue",
      trigger:
        "项目级主要行为、主要迭代目标背景变更与归档、项目级主要任务终态/阻塞/返工立即触发；其余候选按 ≥40 条或 ≥20 分钟批量触发；也可手动刷新。",
      prompt:
        "按可核验的变化判断是否值得建立或更新项目进程；实质性的目标或背景变化记录前后、原因与影响。提交新增或更新条目时返回覆盖后的完整项目现状正文，只写内容，不要标题、列表或加粗等修饰；零产出合法。",
      tools: ["候选信号（只读）", "现有记忆索引（只读）"],
      completion:
        "候选完成分析后原子保存结果并推进队列；零产出同样完成。项目进程条目保留出处及重要变化，项目现状整份覆盖。",
      failure:
        "来源缺失或处理失败保留候选并按退避自动重试，最多 5 次，之后停止自动重试；同一份内容和项目现状未变时直接复用上次结论，不调用模型；信号变化时拒绝旧结果。",
      batch: 40,
    },
    {
      key: "task_memory",
      label: "主要任务",
      subject: "task",
      queue: null,
      trigger:
        "任务进入终态（completed / failed / cancelled / superseded）、阻塞或返工，且属于主要任务（正式任务、失败、重试、返工、阻塞或明显偏慢）；随项目进程结算承接，不占独立队列。普通任务的开始/进行中不触发，只进任务分布。",
      prompt:
        "只有关键交付、困难任务、阻塞任务、反复重做、失败任务或专项任务才单独立条，写清为什么重要、目标与约束、关键决策、结果、失败与代价、返工经验，并选择受控二级类型；普通任务合并成迭代任务分布。正文总结经验，不复制执行日志。",
      tools: ["任务与执行记录（只读）"],
      completion:
        "主要任务一条 + 每个迭代一条任务分布；每条带受控 subtype，口径固定（耗时取 created_at → finished_at，坑取执行记录 error）。",
      failure: "统计失败不写半条；下次结算整体重算；原始任务记录是唯一事实，记忆可重建。",
      batch: 0,
    },
    {
      key: "document_memory",
      label: "文件索引与关联",
      subject: "document",
      queue: "agent_document_memory_queue",
      trigger:
        "定时扫描文档操作日志并核对文件，建立基础索引；内容新增或变化后入队识别，删除后作废记忆。每日补查历史文件。",
      prompt:
        "总结文件内容、用途、检索主题和使用场景；图片描述画面与关键文字，压缩包列出可核验的清单。不能只按文件名猜内容；说明识别范围和限制，原始内容通过版本出处核对。",
      tools: [
        "本次版本正文、提取结果或压缩包清单（后端提供）",
        "图片视觉输入（适用时）",
        "save_file_index_summary（保存本次文件摘要）",
      ],
      completion:
        "模型调用保存工具，后端复核版本和内容后原子发布摘要并出队；单文件索引关联 document_version，四个根索引按可访问文件动态提供导航。每批最多 50 份，逐文件处理并记录结果。",
      failure:
        "处理失败保留上次摘要并按退避自动重试，最多 5 次，之后停止自动重试；同一版本已有摘要且内容未变时直接出队，不调用模型；无法读取内容时记录原因并延后 30 天，人工可重新排队。",
      batch: 50,
    },
  ].sort((left, right) => MEMORY_JOB_ORDER.indexOf(left.key) - MEMORY_JOB_ORDER.indexOf(right.key)),
);

export const MEMORY_JOB_KEYS = Object.freeze(MEMORY_JOBS.map((job) => job.key));

export function memoryJobSpec(key) {
  return MEMORY_JOBS.find((job) => job.key === key) || null;
}
