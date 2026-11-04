# 项目记忆：当前实现契约

最近核查：2026-11-04，本地代码、独立测试库与线上。已随提交 `7316999` 于 2026-11-04 发布上线，生产迁移 198 → 201（发布凭据见 [云端环境](05-cloud-environment.md) 文末记录）。完整设计、验证与恢复边界见 [按来源治理记忆](20-memory-source-lifecycle-plan.md)。后文第 10 节起保留旧实现记录，只用于追溯，不能作为当前接口契约或本轮验收成绩。

## 1. 治理原则

决定都有出处。记忆只分现行 current 与作废 superseded，现行不表示真实。五大类表达用途：关键发言、核心议题、主要任务、项目进程、文件索引。三大来源决定更新与作废权限，修改五类标签不能改变来源权限。AI 疑问、矛盾分析和人工反馈独立保存，不是记忆真假状态。

| 来源           | 当前更新                                             | 作废权限                                           |
| -------------- | ---------------------------------------------------- | -------------------------------------------------- |
| 群消息         | 保存谁何时说过什么，明确改口另记并关联，旧话不被覆盖 | 只有真实登录的人类可明确作废，须有写权限并填写原因 |
| 项目—迭代—任务 | 当前状态据实覆盖，创建、执行和变更事件累积           | 人和 AI 均禁止                                     |
| 项目文件       | 依确认事件与内容身份替换索引，保存旧修订             | 文件维护服务自动处理                               |

未知或混合来源保留缺口，不能按第一条出处或用途标签授权。归档项目遵守现有项目访问与写入边界。

## 2. 保存与出处

- wiki_pages、wiki_page_sources 和 memory_relations 保留，新增 corrects 纠正关系。memory_page_revisions 固定正文与当时出处，document_content_revisions 固定文件字节，memory_evidence_snapshots/links 保存依据，memory_judgments 保存独立判断。
- conversation_memory_source_snapshots 保存原话与作者。消息编辑不抹去已形成的快照；原消息被永久删除后仍遵守访问边界。
- project_activity_history 保存业务事实事件。创建者、创建时间、归属、任务现状和执行数来自业务表；无法确认的更新操作者留空。完整计数与分页明细从同一只读快照读取。
- 文件导航仍按 artifact，内容变更产生新索引。旧索引作废不删除旧正文和旧字节。确认日志保留来源产物版本及确认 ID；未确认的新产物不能替换正式内容。人工移除文件组合仅隐藏展示，不作废记忆。
- 回答固定实际阅读的记忆修订；任务创建固定来源请求、明确采用的 memoryRevisionIds 和附带文档修订。检索到不等于采用。旧决定缺少快照时不补造依据。
- 项目现状不是记忆条目：每项目一行 `project_status.body`（纯正文），随项目进程结算覆盖；写入时清洗掉标题、列表、加粗等修饰，不保存修订或来源快照，历史变化由项目进程条目承担。

## 3. 接口与工具

以下均沿用项目成员和原出处权限。

| 接口                                            | 当前语义                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| GET /api/projects/:id/memory                    | 导读、时间轴、现行或作废条目、来源和关系                                      |
| GET .../memory/counts                           | disputes 与 updatedSinceEntry，不再返回 drafts。disputes 是反馈展示的兼容字段 |
| POST .../memory/entries/:entryId/supersede      | 真人停用群消息来源记忆，须传 reason                                           |
| POST .../memory/entries/:entryId/flag           | 独立反馈，保留正文与生命周期                                                  |
| POST .../memory/entries/:entryId/confirm        | 已退役，先核对写权限再返回 410                                                |
| GET .../memory/entries/:entryId/history         | 修订、固定证据、独立判断与采用它的任务，limit/offset 分页                     |
| GET .../memory/facts                            | 直接业务事实、全量统计、迭代或任务分页及事件分页                              |
| GET /api/memory-revisions/:revisionId           | 当时记忆正文与来源，按原出处核对权限                                          |
| GET /api/document-content-revisions/:revisionId | 下载当时文件内容，回收、永久清除与项目权限仍生效                              |
| GET /api/tasks/:id/decision-evidence            | 任务创建时的记录与依据，不能以此推定后续重排依据                              |

MCP 与 DSH 提供 search_memory、read_memory_history、read_memory_revision、read_project_facts。search_memory 支持 purpose=current/history/explain、status=current/superseded/all 及 asOf。当前查询按明确纠正关系弱化旧话，历史与解释查询保留旧话。asOf 只返回当时已经记录的修订，不推测缺失历史。get_task 返回已保存的决定依据。

## 4. 归档、前端和兼容

归档只汇总 current、superseded、disputed，不转正、不自动作废，移除 memoryDrafts 和 confirmedEntryIds。正文不提供手工改写入口；人工可提交反馈、管理用途标签与关系，并在授权范围停用群消息记忆。候选作业、任务和归档流程本身的工作状态不属于记忆生命周期。

项目记忆界面移除草稿和转正，展示来源、独立反馈、历史修订与业务事实。回答引用可打开固定修订；任务详情可查看创建时的决定出处。入口提示点依据反馈与新变化，不再统计草稿。

## 5. 本轮验证与限制

迁移 210—217 已在本机独立测试库验证；220 号迁移把项目现状收敛为单份 Markdown，并删除旧现状节点、来源快照与修订表。最终测试、构建和检查记录见方案第 8 节。真实模型质量、浏览器点击和线上发布不在本轮自动化验证范围。

项目现状是一份覆盖式 Markdown，具体阶段以它为准，精确状态和数量应读取业务事实。旧历史无法凭空补齐；完整出处通过分页与固定修订 ID 读取，不能把检索 top-K 当作完整证据集合。升级与回退须同时考虑两态数据库约束和旧服务仍写草稿的问题。

## 10. 历史实现状态（2026-10-25，以下记录不是当前契约）

已落地：

- 迁移 `132_project_memory_queue.sql`；队列表按 §5。
- 迁移 `137_memory_subjects_and_relations.sql`：`wiki_pages` 增加 `subject_type`（五类记忆）、`recall_count`、`last_recalled_at`；`wiki_page_sources` 出处补 `thread`；新建 `memory_relations`（relates / derives / supersedes）。
- `shared/memory-kinds.js`：五类记忆、中文标签、Markdown 骨架；项目进程由项目/成员/迭代变更入候选，核心议题保留群聊快照，主要文档补充图片识别与成组文件共享摘要；`server/memory-graph.js`：建/删关系、单条直接关系、最多 3 跳召回、召回计数，继承成环返回 409。
- 结算写入带 `subject`：`project_memory` 输出的条目可指定对象类型，`applyProjectMemoryResult` 落 `subject_type`，`update` 时保留原值。
- `server/memory-timeline.js`：读侧聚合、counts、confirm、flag、`settleIterationMemory`、争议推导 `disputedEntryIds`。
- 记忆作业面板：五类口径、积压、最近运行、立即运行、调整口径、失败重试、讨论补跑；每个维护作业可看轨迹（agent 日志）、运行历史、维护会话；历史回填由后台维护任务自动补齐，手动补跑入口移到管理空间项目操作列；老翁已不在一级监控页出现。
- 管理侧写接口：`POST/DELETE /memory/relations` 建删关系、`PATCH /memory/entries/:entryId` 改对象类型与归属成员（`aboutUserId` 需为项目成员），均要求写权限。
- 读侧条目带 `subject`（五类对象）与 `relations`（关联/继承/替代，含方向与对方标题），`GET /api/projects/:id/memory` 与单条详情一致。
- 路由：`GET /api/projects/:id/memory`、`GET /api/projects/:id/memory/counts`、`POST .../memory/entries/:entryId/confirm`、`POST .../memory/entries/:entryId/flag`、`POST .../memory/refresh`（202）。
- 归档确认：`POST /api/threads/:id/archive/confirm` 支持可选 `confirmedEntryIds`，响应带 `settlement`；重复确认走 `apply=false` 只读重算。
- `server/document-memory.js`：正式文件新版本落库后同步写单文档记忆（种类、大小、关键版本、变更要点、怎么读），并按所在文件夹聚成「文档组：<文件夹>」条目，组与成员用 `relates` 相连；zip 用 jszip 列文件清单（文件数、顶层、前 20 个文件名），图片用 sharp 记尺寸与格式；tar.gz 等暂不解析，正文标注需解压。
- `server/utterance-memory.js`：发言记忆落 wiki——`upsertUtteranceMemory` 每个成员一条 `subject=utterance` 页面（`about_user_id` 唯一，滚动更新正文、出处去重），`saveMemberUnderstandings` 在写旧表后同步落 wiki；旧表 `agent_member_summaries` 降为读取缓存。
- **单一事实源（方向 A）**：事实在 `wiki_pages`（+ 出处 + 关系）；`agent_member_summaries` / `agent_document_summaries` / `agent_project_summaries` 降级为缓存，由 `server/memory-cache.js` 从 wiki 刷新：
  - 成员认识：会话结算 apply 后按 `subject=utterance` 刷新；`loadMemberUnderstanding` 已改为 wiki 优先、旧表兜底；
  - 项目导读：结算写入或覆盖 `project_status` 后刷新；
  - 文档摘要：正式版本同步文档记忆后按 `变更要点` 刷新该版本缓存；
  - 回填结束统一 `refreshAllCaches`。
    已切换：`loadMemberUnderstanding`、`loadProjectWikiIndexes`（成员认识；文档摘要缓存缺失时用文档记忆补最新版本）、`loadProjectSummary`（协调器 prompt、项目列表/详情导读）、结算时补建项目整体页。仍以缓存为读来源的只有「旧版本文档摘要」与成员队列 `through_sequence` 语义，属缓存自身数据。
- 存量回填：`backfillProjectMemory` / `POST /memory/backfill`（幂等）：按出处把 `subject_type IS NULL` 的旧条目归类；`agent_member_summaries` → 发言记忆；`agent_document_summaries` → 文档记忆「变更要点」；归档迭代补讨论记忆；再补任务分布与项目整体页。后台 `POST /api/memory-maintenance` 会为尚未完成回填的活跃项目自动领取一次回填任务，状态写入 `project_memory_backfills`，失败后续轮次重试；管理空间项目列表的操作列保留 `POST /api/admin/projects/:id/memory/backfill` 手动补跑入口，项目记忆弹窗不再放置该按钮。
- 召回入口：老翁经 MCP `search_memory`，小祥与子 Agent 经 `server/agent-tools.js` 的 `search_memory` 分发（能力键 `project_memory_recall`，工具参数 query/subjects/aboutUserId/status/depth/limit）。
- 统一重试：`retryMemoryJob` 按作业键分派（`project_memory` → 手动结算，`member_memory`/`document_memory`/`iteration_archive` → 排队并内联跑一批；任务/讨论记忆随结算，返回 409）。
- 可用性评估结论与限制见 `14-project-memory-usability.md`。
- 迁移 `139_memory_job_settings.sql`：项目级口径覆盖（`enabled` / `trigger_threshold` / `prompt`），停用与阈值已接入 `maybeQueueProjectMemoryRun`、`queueLaowengMemoryRun`、`queueProjectMemoryRun`，提示词覆盖追加到结算 instructions。
- `shared/memory-jobs.js` + `server/memory-jobs.js`：四类记忆作业的触发、提示词、工具、完成标准、失败补救口径（核心议题与关键发言合为一条作业，只有产物分成议题、发言两类）；管理视图 `GET /api/projects/:id/memory/jobs` 返回口径、最近一次 `agent_laoweng_runs` 与积压（议题/发言/文档/项目队列），只读。
- `server/memory-search.js`：`searchProjectMemory` 按对象类型 / 成员 / 关键词检索（ngram，未命中回退 LIKE），按关系展开 1 跳，返回出处并累计召回；MCP 只读工具 `search_memory` 已注册，问老翁经 `callMcpTool` 自动带 projectId 调用，引用映射到记忆出处（消息 / 文档版本 / 任务 / 迭代）。
- `server/task-memory.js`：任务记忆聚合（耗时、重试、返工、坑，状态与执行者分布），提供 `loadTaskMemoryStats`、`importantTasks`、`taskMemoryMarkdown`、`taskDistributionMarkdown`；结算候选的任务信号已带执行者类型、执行次数、失败次数、重试与最近错误，按提示词拆成「主要任务单条 + 迭代任务分布」。
- `server/discussion-memory.js` 另有 `syncThreadDiscussionMemory` 宽窗口版：扫一整个迭代的可见发言（≤500 条），生成/更新一条「讨论：<迭代名>」总结，群聊快照只作为模型上下文和消息出处保留，不直接复制进正文；同时连参与者发言记忆，并用 `derives` 继承到项目整体；归档确认后自动执行，也可 `POST /api/projects/:id/memory/discussion/:threadId` 手动补跑；口径固定为默认，不接受项目级覆盖。
- `server/discussion-memory.js`：讨论记忆写入原语——`upsertDiscussionMemory` 按话题归一键（标题去空白与标点）跨迭代合并、出处去重；`linkDiscussionParticipants` 从消息出处反查参与者，把各自发言记忆用 `relates` 连到讨论记忆；结算写 `subject=discussion` 条目后自动连边。
- 老翁 `project_memory` 任务：`noteProjectMemorySignal` 轻标记、`maybeQueueProjectMemoryRun` 阈值/事件触发、`processNextMemorySettlement` 结算、`queueProjectMemoryRun` 手动刷新；任务已注册进 `LAOWENG_MAINTENANCE_TASKS`。
- 三处轻标记：消息写入（`server/service-messages.js`）、任务状态变更（`server/task-pool-activity.js`）、正式文件新版本（`server/documents/versions.js`）。
- 信号生命周期：删除整份文档、版本进回收站、同名合并软删、清空回收站、删除迭代连带删文档时，同步清掉指向这些版本的 `document_version` 信号（`dropDocumentVersionSignals`）；从回收站恢复正式文档会重新排一条，保证这次恢复仍进入结算。`runMemoryMaintenance` 每轮先执行 `dropUnavailableDocumentVersionSignals` 清理历史遗留的失效信号；结算加载候选时也会把「来源已删除」的信号直接丢弃并收口为完成运行（`agent_called=false`），只有暂时取不到的信号才继续退避重试。
- 失败预算按内容算：同一来源产出新内容（提示变化触发 `signal_revision` 递增）时 `noteProjectMemorySignal` 重置该行 `retry_count` 与 `last_error`；人工「立即运行 / 重试」经 `resetProjectMemoryRetryBudget` 重置项目进程排队行的失败次数并把行拉回当前。否则历史失败会算进新一次重试，任何新错误都直接落成「已停止自动重试」。
- 项目现状覆盖条件：模型对 `summary` / `statusMarkdown` 返回 `null` 视同未返回（不再整份判失败）；只有提交项目进程条目（`subject=project`）或主动给出正文时才覆盖 `project_status`，本次只提交任务/文档条目且未给正文时保留原现状、条目照常写入。
- 维护会话快照上限：`saveCheckpoint` 超过 10 MiB 时不再让整次运行失败（否则每次运行都在结尾失败、作业永久卡死），而是重置维护会话（新 `session_id`、清空 `checkpoint` 与 `context_stats`）并把本次已校验结果照常返回；轨迹记「会话快照超过上限，已重置维护会话」。`runLaowengTask` 与 `compactLaowengSession` 两条保存路径都已接这个降级。
- 前端：`web/ProjectMemory.tsx` 普通窗口弹窗（打开后可手动全屏；7:3：导读 / 带搜索的倒序记忆时间轴 / 记忆详情二级弹窗；种类筛选为默认「全部」的标准切换胶囊）、左侧四宫格「项目记忆」与小点、首次进入自动打开、`?projectId&memory=1` 直达；归档确认后提示清算摘要。
- 迭代清算的人工校准：归档详情返回本轮记忆草稿 `memoryDrafts`，归档确认页可逐条勾选，勾选的条目在确认事务里转正。
- 项目归档封存：项目归档后成员失去项目访问权（`p.archived_at IS NULL` 权限门槛），记忆读写都不可达；确认/纠错/知识页写入另有 409 防御拦截。
- 人不再手写知识页：知识页 HTTP 写接口下线；右侧栏「知识页」tab 一并下线，问老翁引用改为打开项目记忆并聚焦该条。
- 记忆详情弹窗按可读性打磨：头部 meta（类型 / 状态 / 争议 / 更新时间）、正文限宽与行高、所属迭代与出处各成卡片、底部操作条固定。
- 时间轴支持按状态筛选（默认只看草稿与现行），卡片右上角显示状态中文标签。
- 主弹窗与详情弹窗都带全屏切换；详情底部不再放关闭按钮（走头部 X 与 Esc）。
- 确认与纠错都先弹二次确认，确定后才调用接口，避免误点改变记忆状态。
- 使用手册 `public/docs.html` 增补「项目记忆」章节。
- 测试：`tests/project-memory.test.js`（入队与结算、确认与纠错、迭代清算与重放、失败次数不跨内容变化与人工重试继承）；`tests/project-status.test.js`（现状覆盖、只提交任务条目时可不带现状、项目进程条目缺现状时整次失败）；`tests/project-memory-signal-cleanup.test.js`（删除/恢复/清空回收站/同名合并清信号，历史失效信号扫描清理，只剩死信号时结算收口为完成）。
- 轨迹与重试已接入 MCP：`get_laoweng_logs` 接受 `project_memory`，`retry_laoweng_task` 对 `project_memory` 走一次立即结算（与 `POST /memory/refresh` 同一条路径）。
- 老翁工作面与各任务触发/产出见 [13-laoweng-workloads.md](13-laoweng-workloads.md)。

与契约的差异（以代码为准）：

- `GET /memory` 额外返回 `canWrite` 与条目上的 `disputed`；时间线按 `archived_at` 升序（老→新）。
- `flag` 返回 `{...entry, disputedAt, flagNote}`；空备注由 zod 拒绝，HTTP 层映射 400。
- `settlement` 字段：`confirmed`（本轮已确认总数）、`promoted`（本次实际转正）、`superseded`、`keptDraft`、`disputed`。
- 争议状态不落列，由 `project_change_logs` 的 flagged/confirmed 时间先后推导。
- `members.tab_opened_at` 的 open 动作改为 `COALESCE`，保证「已可见但为空」时也补写首次进入时间。

待办：

1. 存量手写页的归位与复核：老翁首次全量清算时给合并/替代建议，人确认后处理（当前存量页只读保留，不丢数据）。
2. 浏览器实机验收（本机无 browser provider，目前只有静态检查、构建与集成测试）。
3. 记忆详情里的创建时间：后端条目暂只返回 `updatedAt`，需要时补 `createdAt`。
