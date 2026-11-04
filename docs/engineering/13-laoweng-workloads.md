# 老翁的工作面与项目记忆写入

状态：2026-10-25 的历史工作面记录。关键发言与核心议题现行实现以 [联合分析设计](16-conversation-memory-design.md) 和 `server/conversation-memory-*.js` 为准；主要文档和项目进程以 [文件索引设计](17-file-index-design.md)、[项目进程设计](18-project-process-design.md)及对应实现为准。本文未覆盖的旧描述不构成当前验收结论。

## 1. 定位与边界

- 老翁是项目级维护 Agent，机器键 `laoweng`，与小祥（`xiaoxiang`）并列为项目里的两名 Agent 成员；子 Agent 是小祥委派的执行身份，不单独计成员。
- 不进迭代会话、不出现在 @ 候选；只维护项目知识、成员认识与项目记忆，不改任务状态、不代小祥发言。
- 记忆本身就是 wiki 的一种：正文统一 Markdown，存 `wiki_pages`，复用出处与确认机制，不另起存储。五类记忆（关键发言、主要文档、主要任务、核心议题、项目进程）之间用关联与继承织成网状，不按目录分叉；每条记忆另有受控二级类型，用于稳定归类。
- 每类维护任务按「项目 × 任务」各有一套 DSH 持久会话：`agent_project_sessions`（`scope_id` 固定为项目 ID），工作目录 `.local/agents/laoweng-<task>-<projectId>`，检查点 gzip 后存库，单份上限 10 MiB。同项目下一次维护接续同一套上下文。
- 会话与任务之间用命名锁 `cothread-laoweng:<task>:<projectId>` 串行：同一项目同一任务同时只跑一个，撞锁的一方直接跳过。

### 1.1 五类记忆与关系网

| 记忆     | subject_type | 记什么                                                   |
| -------- | ------------ | -------------------------------------------------------- |
| 关键发言 | utterance    | 关键发言及上文背景、立场与主张、承诺与待办、引用提示     |
| 主要文档 | document     | 是什么、关键版本、变更要点、共享摘要、何时该看           |
| 主要任务 | task         | 重要/困难/反复重做/阻塞任务的目标、决策、结果与代价      |
| 核心议题 | discussion   | 议题、参与者与观点、依据、结论与下一步；群聊快照只作出处 |
| 项目进程 | project      | 项目初创、成员调整、迭代创建与目标背景变更、迭代归档     |

- **发言记忆已落 wiki**：新记忆按重要发言或同一成员的相关观点建条，以 `about_user_id` 标识成员，带消息出处；旧的成员汇总页保留，不按缺失证据强拆。`agent_member_summaries` 是读取缓存，不是联合窗口游标。
- **发言记忆不是评价人**：它按项目成员维度记「这名成员说过什么、主张什么、承诺什么」，不做人格或能力评价；成员可以据此回看自己说过的重要判断与承诺，读侧按 `about_user_id` 过滤。
- **讨论记忆写入**：与关键发言共用消息窗口和只读工具，单人提出值得持续关注的问题也可建正式议题。待讨论、讨论中、已有结论、暂缓明确标示；后续依据出处更新。共同消息出处连接相关发言和议题，标题相同并引用相同消息的创建会被拦截；语义匹配仍依赖模型和检索，不能保证识别所有改写。
- **归档与补跑**：归档前后提前唤醒已有窗口；手动补跑和历史回填把尚未处理的消息入队，不直接生成整迭代合成讨论页。旧宽窗口函数仅为存量兼容，不再是上述入口的写入路径。
- **文档记忆**：正式文件新版本落库即同步一条单文档记忆（是什么/关键版本/变更要点/共享摘要/何时该看），同文件夹自动聚成「文档组」并用 `relates` 连成员；zip 直接列清单并说明用途，图片交给支持视觉输入的老翁识别画面与关键文字，不整包读取；tar.gz 等暂不解析。
- **任务记忆**：主要任务（失败、重试、返工、正式任务、耗时偏长）单独立条，普通任务合并成本迭代一条「任务分布」；执行者按 `execution_agent_type` 分人类与子 Agent，耗时取 `created_at → finished_at`，坑取执行记录 `error`。
- **议题可逐步形成**：单人明确提出且值得长期关注即可入库；后续补充、争议和结论更新同一条，不能把个人主张写成共识。五类是类型标签，不是目录层级。
- 条目之间用 `memory_relations` 织网：`relates` 关联、`derives` 继承（单向、禁止成环）、`supersedes` 替代；出处仍走 `wiki_page_sources`，只证明事实来自哪，不表示记忆之间的关系。
- 问老翁读侧：`search_memory` 可按对象类型、成员、关键词检索记忆并展开 1 跳关系；发言记忆按 `about_user_id`，既能问「我」也能问项目其他成员说过什么。
- 召回顺序：对象直命中 → 关系 1 跳 → ngram 全文索引 → 出处原文；`recall_count` / `last_recalled_at` 只加计数，不删除记忆。
- 正文统一 Markdown，骨架见 `shared/memory-kinds.js` 的 `MEMORY_SKELETONS`；骨架是写作提示，不是字段校验。

## 2. 四类维护任务

任务键清单见 `shared/agent-label.js` 的 `LAOWENG_MAINTENANCE_TASKS`。四类的运行记录都写 `agent_laoweng_runs`。

| 任务键              | 中文               | 触发                                                                                       | 输入                                                              | 产出                                                                             |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `member_memory`     | 发言与议题联合分析 | 群聊消息入 `conversation_memory_queue`，静默 10 分钟 / 首条等待 1 小时，手动或归档提前唤醒 | 按消息和字符预算分窗口；带相邻前文、相关记忆、观察项和只读查询    | 分别写发言 / 议题及出处，持久化候选、独立状态、变更和待观察问题                  |
| `document_memory`   | 文档摘要           | `agent_document_memory_queue` 到期                                                         | 不可变版本正文（≤50000 字）或已带回的候选摘要                     | `agent_document_summaries`                                                       |
| `iteration_archive` | 迭代归档           | 两阶段：`draft`（thread=archiving）/ `memory`（thread=archived）                           | draft 用冻结快照与未完成任务；memory 用结论、讨论节选、旧长期总结 | draft 写 `iteration_archive_workflows.plan`；memory 写 `agent_project_summaries` |
| `project_memory`    | 项目记忆日常结算   | 候选队列达阈值 / 静默到点 / 事件型 / 手动刷新                                              | 候选信号（≤40 条）+ 现有条目索引                                  | `wiki_pages`（draft）+ 出处 + 变更日志                                           |

### 2.0 已下线：文档整理（2026-10-25）

第五个任务键 `document_organization` 已下线：`POST /api/projects/:id/documents/organize` 返回 410，维护排空链与常驻 lane 都移除了它，监控页与文档库的「正式文件整理」入口一并去掉。作业表 `document_organization_jobs`、`server/document-organization*.js` 与任务键保留，只用于读取存量记录与轨迹；迁移 136 把当时排队/执行中的作业收口为 `failed`（错误「文档整理已下线」）。下线原因是它属于文档库事务，不属于五类记忆（成员、文档、任务、讨论、项目整体）。

### 2.1 各任务的失败语义

- **发言与议题**：消息在入队和窗口中保存指纹；无法读取、格式或核验失败时保留失败项，按 1 分钟 → 5 分钟 → 30 分钟 → 2 小时 → 6 小时退避，第 6 次仍失败即停止自动重试。已分析窗口的失败计数达到自动重试上限（5）时直接收口、保留候选失败记录，不再自动调用模型核验；手动运行（立即运行 / 重试）仍可再试。待观察问题复核失败按 5 分钟 → 15 分钟 → 1 小时 → 6 小时 → 24 小时退避，超限同样停止。已完成项不重复写；零产出正常完成。
- **文档摘要**：非文本且没有候选摘要的版本只留一次 30 天兜底，不做每日空跑；同一版本已有摘要且内容未变时直接出队、不调用模型；失败按退避重试，最多 5 次后停止自动重试。
- **迭代归档**：draft 阶段硬校验「是否逐个覆盖全部未完成任务」，漏一个或多个就整轮失败；归档被撤回或方案变化时记 `completed` 且 `discarded`。
- **项目记忆**：只为项目级信号（`milestone` / `iteration_context` / `archive` / `task` / `document_version`）排队；议题页与文件索引关系不再触发结算。零产出合法（`had_updates=false`，不写条目）；同一批候选内容与项目现状都不变时复用上次结算结论、直接出队，不调用模型；失败按退避重试，最多 5 次后停止自动重试；整批写入在一个事务里，不留半成品。

**自动重试上限**：退避与上限统一由 `server/memory-retry.js` 给出（默认 `[60,300,1800,7200,21600]` 秒，失败 5 次后停止）。停止只影响自动重试，管理视图的「立即运行 / 重试」和讨论补跑仍可手动触发；停止原因写在队列行 `last_error` 与运行 `error` 里，面板可见。

### 2.2 过程轨迹

每次维护都往 `agent_project_events` 写阶段行：`prepare_context` → `start_harness` →（必要时）`compact_context` → `model_run` → `validate_result` → `save_checkpoint`。每行带一句 `summary`（输入条数、上下文用量、模型结论摘要、校验字段等）和 `trigger_source`（`schedule` 定时 / `user` 手动）。轨迹是排查「老翁到底卡在哪一步」的第一手材料。

### 2.3 四类记忆作业口径（调优清单）

口径的单一事实源是 `shared/memory-jobs.js` 的 `MEMORY_JOBS`；管理视图 `GET /api/projects/:id/memory/jobs` 返回口径 + 最近一次运行 + 积压，只读、不触发作业。

| 作业                           | 触发                                                   | 完成标准                                                | 失败补救                                                                                                |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `member_memory` 议题与发言记忆 | 同一消息窗口联合分析；静默 / 最长等待 / 手动和归档触发 | 关键发言条目 + 核心议题条目，各自出处与状态；零产出允许 | 窗口和候选持久化，失败退避重试、最多 5 次后停止自动重试，已完成项保留                                   |
| `document_memory` 文档记忆     | 正式文件新版本到期；zip 自动列清单、图片记尺寸         | 单文档记忆更新 + 组条目同步，出处指向版本               | 非文本无候选只做 30 天兜底；已摘要且内容未变直接出队；解析失败降级为类型/大小/sha256，退避重试最多 5 次 |
| `task_memory` 任务记忆         | 任务终态、重试或返工（随结算承接）                     | 主要任务一条 + 每迭代一条任务分布                       | 统计失败不写半条，下次结算重算                                                                          |
| `project_memory` 项目整体记忆  | 候选 ≥ 40、最久等 20 分钟、urgent、手动刷新            | 结算写库 + 出处 + 变更日志；有变更才清队列              | 队列保留可重试；同内容同现状复用旧结论、不调模型；退避重试最多 5 次                                     |

**事实源与缓存**：三张摘要表（成员认识 / 文档摘要 / 项目导读）已降级为 wiki 的读取缓存，写 wiki 后由 `memory-cache.js` 刷新（结算、发言写入、文档版本同步、回填）；成员认识、项目导读（含协调器 prompt 与项目列表）、文档摘要索引均已改为 wiki 优先 + 缓存兜底，结算会补建项目整体页。

**存量数据**：历史条目（`subject_type` 为空）不会被删除，界面上用「未分类」筛选可见。后台维护任务会为活跃项目自动执行一次幂等回填，并在 `project_memory_backfills` 中记录完成或失败状态；按出处归类旧条目，把旧成员/文档摘要折算进发言记忆、文档记忆，归档迭代排入讨论记忆，最后补任务与项目整体页。管理空间的项目操作列保留「回填历史」手动补跑入口，项目记忆弹窗只展示作业状态。旧条目没有关系边属正常，可在详情里手动补。

可用性评估（走查结论、模型依赖边界）见 `14-project-memory-usability.md`。

调优顺序：先改 `MEMORY_JOBS` 的口径，再改对应实现；管理视图用来确认「最近一次是否按新口径完成」。

**项目级覆盖**：当前作业口径固定为默认；`PATCH/DELETE /api/projects/:id/memory/jobs/:key` 返回 409。迁移 139 的历史配置行保留，但不作为当前调度配置。

## 3. 非 run 型工作面

| 面               | 实现                                                  | 说明                                                                                             |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 问老翁           | `server/elder-kernel.js` / `server/wiki-questions.js` | 按项目 / 组织 / 公司 / 网页四种范围作答，只消费 `current` 记忆并带出处；不写记忆、不产生维护 run |
| 维护会话压缩     | `server/laoweng-context.js`                           | 按 `project_id + task` 排队压缩，模型压力到达阈值前自动压缩，也可手动排队                        |
| 归档草案异步起跑 | `startIterationArchive`                               | 认领 queued run 后不阻塞请求，草案在后台生成                                                     |

## 4. 调度、并发与恢复

- **定时入口**：`POST /memory/maintenance`，Bearer `MEMORY_MAINTENANCE_TOKEN`，一次最多 25 批；按「项目记忆（结算/成员/文档/归档）→ 老翁压缩 → 子 Agent 压缩」的顺序排空。
- **手动内联推进**：`queueLaowengMemoryRun` 当场最多跑 5 批，`queueProjectMemoryRun` 最多 3 批，便于人点完立刻看到结果；失败留在 run 记录，不影响后续兜底。
- **唤醒**：写库后 `publishWork`，常驻 lane 分道领取；成员发言、文档摘要、迭代归档各自成道，可并行。
- **超时回收**：`recoverStaleLaowengRuns` 把 `running` 超过 10 分钟的行改回 `queued` 并写明中断原因，服务重启后也能续上。

## 5. 项目记忆的写入场景

落点：`wiki_pages`（条目）、`wiki_page_sources`（出处）、`agent_project_summaries`（导读 / 长期总结）、`project_change_logs`（审计）；成员认识与文档摘要各有独立表。没有独立知识库或向量库。

### 5.1 候选入队（轻标记，不调模型）

| 事件             | 位置                           | 写入                                                                                                |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 群聊消息         | `server/service-messages.js`   | 写入独立的 `conversation_memory_queue` 和消息指纹，不再由项目结算重复处理                           |
| 项目主要行为     | `server/service-projects.js`   | `source_kind='milestone'`，项目创建/简介目标背景/成员变化，`urgent=true`                            |
| 迭代目标背景变更 | `server/service-iterations.js` | `source_kind='iteration_context'`，`urgent=true`；迭代创建不单独入队                                |
| 迭代归档         | `server/iteration-archive.js`  | `source_kind='archive'`，仅主要迭代（有主要任务、实质讨论、核心议题或目标变更）`urgent=true`        |
| 任务主要行为     | `server/task-pool-activity.js` | 终态/阻塞/返工且属于主要任务时写 `source_kind='task'`、`urgent=true`；开始与进行中不写              |
| 正式文件新版本   | `server/documents/versions.js` | `source_kind='document_version'`，仅 `folder_kind='project_official'`，`urgent=false`（只入候选池） |

- 唯一键 `(project_id, source_kind, source_id)`，重复只刷新 hint 与可用时间。
- 只有项目级信号（`milestone` / `iteration_context` / `archive` / `task` / `document_version`）会入队；`memory_page`（议题页、文件索引关系）请求会被 `noteProjectMemorySignal` 直接忽略，旧版本留下的这类队列行在下一次调度时删除，不调用模型。清单的单一事实源是 `server/project-memory.js` 的 `PROJECT_MEMORY_SIGNAL_KINDS`。
- 结算条件：项目/主要迭代/主要任务的事件型信号立即触发；其余候选按 ≥40 条或最早静默 ≥20 分钟批量触发；手动刷新始终可用。
- 手动「现在整理」不写队列，直接插一条 `trigger_source='user'` 的 run。

### 5.2 日常结算写条目（`project_memory`）

| op        | 行为                                              | 结果                         |
| --------- | ------------------------------------------------- | ---------------------------- |
| `create`  | 新插 `wiki_pages` + 逐条出处                      | `draft`，等人确认            |
| `update`  | 只允许改草稿                                      | 草稿内容更新；现行条目改不动 |
| `dispute` | 只写 `project_change_logs(memory_entry_disputed)` | 不覆盖现行，等人在过程中裁决 |

有实际变更才删队列条目；整批在事务内，并落一条 `project_memory_settled` 审计。

### 5.3 归档写入

1. **归档确认生成页**：`recordArchivePages` 在确认事务内建 `retro` 复盘与 `decision` 决策两页，直接 `current`，出处 `source_kind='archive'`（值为 workflow ID），并刷新参与组织简报。
2. **归档清算**：`settleIterationMemory` 只把人勾选的草稿转正（`memory_entry_confirmed`），未勾选保留计数，有纠错标注的补一条争议日志；重复确认走 `apply=false` 只重算不写。
3. **归档后长期记忆**：`iteration_archive` 的 memory 阶段覆盖写 `agent_project_summaries`，即项目记忆弹窗顶部的导读。

### 5.4 人工干预

| 动作     | 写入                                                | 边界                                                        |
| -------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 确认     | `draft → current` + `memory_entry_confirmed`        | 项目成员，viewer 除外                                       |
| 纠错标注 | 不改正文，写 `memory_entry_flagged` + `disputed_at` | 空备注被拒（400）                                           |
| 手写正文 | —                                                   | 已下线，HTTP 返回 409；服务层 `createWikiPage` 只剩测试调用 |
| 项目归档 | —                                                   | 记忆随项目封存，读写都 403/409 防御拦截                     |

### 5.5 状态机

```
日常结算 ──create──▶ draft ──人确认/清算勾选──▶ current ──冲突裁决/替代──▶ superseded
                     │                          │
                     └─清算未确认：保留计数      └─日常结算只许小补，不许覆盖结论
项目归档 ─────────────────────────────────────▶ 全程封存
```

问老翁只消费 `current`；草稿不参与回答。

## 6. 接口与可观测

**MCP（老翁维护组）**

| 工具                          | 覆盖                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `get_laoweng_status`          | 会话状态、lastError、成员/文档队列积压、最近 20 条 run、最近 10 条失败                                                               |
| `list_laoweng_runs`           | `agent_laoweng_runs` 里的四类 run（不含文档整理，见 §7）                                                                             |
| `list_laoweng_document_queue` | 文档摘要队列待办                                                                                                                     |
| `get_laoweng_logs`            | 五类任务的阶段轨迹                                                                                                                   |
| `retry_laoweng_task`          | 成员发言、文档摘要、迭代归档、项目记忆重新排队                                                                                       |
| `search_memory`               | 按五类记忆检索（对象/成员/关键词 + 1 跳关系）；老翁走 MCP，小祥与子 Agent 走 `cothread-tools` 工具桥（能力 `project_memory_recall`） |

**HTTP**：`GET /api/projects/:id/memory`、`/memory/counts`、`/memory/jobs`；`/memory/jobs/:key/retry`；`/memory/discussion/:threadId`（将未处理历史消息排队）；`/memory/entries/:entryId/recheck`（来源变化后重核）；`/memory/relations`；`/memory/entries/:entryId`；`/memory/refresh`。作业设置 PATCH/DELETE 当前返回 409。

**界面**：小祥监控只保留小祥与子 Agent 的调度/执行，老翁相关内容已移除；老翁的轨迹、运行历史、维护会话、立即运行、口径调整都在「项目记忆 → 记忆作业」里（监控接口的 knowledge 字段暂保留，界面不再使用）。

排查顺序：`get_laoweng_status` 看会话与队列 → `get_laoweng_logs` 看停在哪一阶段 → `retry_laoweng_task` / `/memory/refresh` 重试。

## 7. 遗留命名与已知差异

- **历史命名已统一**：角色键只有 `laoweng`/`xiaoxiang`/`child_agent`（迁移 128）。本次把仍在使用的旧分级唤醒事件键并入 `child_idle`（迁移 135，含存量行改写）。管理页 `visibleAgentText` 只是历史文本翻译表，把旧提示词/插件名显示成当前成员名，不参与运行。
- **文档整理已下线（2026-10-25）**：入口、调度、UI 都撤了，作业表与任务键保留供读历史。它的运行记录从来不在 `agent_laoweng_runs`（写 `document_organization_jobs`），所以 `get_laoweng_status.recentRuns` 与 `list_laoweng_runs` 都不含它。
- **记忆详情缺创建时间**：后端条目目前只返回 `updatedAt`。
- **存量手写知识页**：只读保留，等老翁首次全量清算给出合并/替代建议，人确认后再处理。
