# 老翁的工作面与项目记忆写入

状态：2026-10-25 按代码核对。记忆本身的数据契约看 [12-project-memory.md](12-project-memory.md)；本文说明老翁有哪几类活、各自怎么触发、写到哪张表、哪里会卡住。

## 1. 定位与边界

- 老翁是项目级维护 Agent，机器键 `laoweng`，与小祥（`xiaoxiang`）并列为项目里的两名 Agent 成员；子 Agent 是小祥委派的执行身份，不单独计成员。
- 不进迭代会话、不出现在 @ 候选；只维护项目知识、成员认识与项目记忆，不改任务状态、不代小祥发言。
- 记忆本身就是 wiki 的一种：正文统一 Markdown，存 `wiki_pages`，复用出处与确认机制，不另起存储。五类记忆（关键发言、主要文档、重要任务、核心议题、里程碑）之间用关联与继承织成网状，不按目录分叉；每条记忆另有受控二级类型，用于稳定归类。
- 每类维护任务按「项目 × 任务」各有一套 DSH 持久会话：`agent_project_sessions`（`scope_id` 固定为项目 ID），工作目录 `.local/agents/laoweng-<task>-<projectId>`，检查点 gzip 后存库，单份上限 10 MiB。同项目下一次维护接续同一套上下文。
- 会话与任务之间用命名锁 `cothread-laoweng:<task>:<projectId>` 串行：同一项目同一任务同时只跑一个，撞锁的一方直接跳过。

### 1.1 五类记忆与关系网

| 记忆         | subject_type | 记什么                                                 |
| ------------ | ------------ | ------------------------------------------------------ |
| 关键发言     | utterance    | 关键发言及上文背景、立场与主张、承诺与待办、引用提示   |
| 主要文档     | document     | 是什么、关键版本、变更要点、共享摘要、何时该看         |
| 重要任务     | task         | 重要/困难/反复重做/阻塞任务的目标、决策、结果与代价   |
| 核心议题     | discussion   | 议题、参与者与观点、依据、结论与下一步；群聊快照只作出处 |
| 里程碑       | project      | 项目初创、成员调整、迭代创建与目标背景变更、迭代归档   |

- **发言记忆已落 wiki**：每个项目成员一条 `subject=utterance` 页面（`about_user_id` 唯一），成员记忆保存时同步滚动更新并挂消息出处；旧表 `agent_member_summaries` 只作读取缓存。
- **发言记忆不是评价人**：它按项目成员维度记「这名成员说过什么、主张什么、承诺什么」，不做人格或能力评价；成员可以据此回看自己说过的重要判断与承诺，读侧按 `about_user_id` 过滤。
- **讨论记忆写入**：结算里同一迭代群聊的核心议题才建条，候选携带迭代标题和群聊快照；标题作话题归一键（去空白与标点）跨迭代合并；写完后从消息出处反查参与者，把各自的发言记忆用 `relates` 连过来，重复结算不重复建边。
- **讨论记忆（宽窗口）**：归档确认后扫整轮可见发言（≤500 条）沉淀一条「讨论：<迭代名>」，挂迭代与消息出处、连参与者发言记忆，并 `derives` 到项目整体；不依赖 40 条候选窗口，可手动补跑。
- **文档记忆**：正式文件新版本落库即同步一条单文档记忆（是什么/关键版本/变更要点/共享摘要/何时该看），同文件夹自动聚成「文档组」并用 `relates` 连成员；zip 直接列清单并说明用途，图片交给支持视觉输入的老翁识别画面与关键文字，不整包读取；tar.gz 等暂不解析。
- **任务记忆**：重要任务（失败、重试、返工、正式任务、耗时偏长）单独立条，普通任务合并成本迭代一条「任务分布」；执行者按 `execution_agent_type` 分人类与子 Agent，耗时取 `created_at → finished_at`，坑取执行记录 `error`。
- **讨论记忆是群体记忆**：单位是「被多人讨论过的话题」，不是事，也不绑定一个迭代。话题可以是新闻、想法、知识、原因或决策；至少两名成员参与才成条，用关系边连到参与的发言记忆和产出（决策、任务、文档）。因此五类只是类型标签，不是目录层级。
- 条目之间用 `memory_relations` 织网：`relates` 关联、`derives` 继承（单向、禁止成环）、`supersedes` 替代；出处仍走 `wiki_page_sources`，只证明事实来自哪，不表示记忆之间的关系。
- 问老翁读侧：`search_memory` 可按对象类型、成员、关键词检索记忆并展开 1 跳关系；发言记忆按 `about_user_id`，既能问「我」也能问项目其他成员说过什么。
- 召回顺序：对象直命中 → 关系 1 跳 → ngram 全文索引 → 出处原文；`recall_count` / `last_recalled_at` 只加计数，不删除记忆。
- 正文统一 Markdown，骨架见 `shared/memory-kinds.js` 的 `MEMORY_SKELETONS`；骨架是写作提示，不是字段校验。

## 2. 四类维护任务

任务键清单见 `shared/agent-label.js` 的 `LAOWENG_MAINTENANCE_TASKS`。四类的运行记录都写 `agent_laoweng_runs`。

| 任务键              | 中文                | 触发                                                                               | 输入                                                              | 产出                                                                             |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `member_memory`     | 成员发言 / 成员认识 | `agent_member_memory_queue` 里有成员的 `pending_through_sequence` 落后于已摘要位置 | 成员身份标签、签名、旧认识、新发言（一次最多 50 人）              | `agent_member_summaries`（认识、发言摘要、已读到序号）                           |
| `document_memory`   | 文档摘要            | `agent_document_memory_queue` 到期                                                 | 不可变版本正文（≤50000 字）或已带回的候选摘要                     | `agent_document_summaries`                                                       |
| `iteration_archive` | 迭代归档            | 两阶段：`draft`（thread=archiving）/ `memory`（thread=archived）                   | draft 用冻结快照与未完成任务；memory 用结论、讨论节选、旧长期总结 | draft 写 `iteration_archive_workflows.plan`；memory 写 `agent_project_summaries` |
| `project_memory`    | 项目记忆日常结算    | 候选队列达阈值 / 静默到点 / 事件型 / 手动刷新                                      | 候选信号（≤40 条）+ 现有条目索引                                  | `wiki_pages`（draft）+ 出处 + 变更日志                                           |

### 2.0 已下线：文档整理（2026-10-25）

第五个任务键 `document_organization` 已下线：`POST /api/projects/:id/documents/organize` 返回 410，维护排空链与常驻 lane 都移除了它，监控页与文档库的「正式文件整理」入口一并去掉。作业表 `document_organization_jobs`、`server/document-organization*.js` 与任务键保留，只用于读取存量记录与轨迹；迁移 136 把当时排队/执行中的作业收口为 `failed`（错误「文档整理已下线」）。下线原因是它属于文档库事务，不属于五类记忆（成员、文档、任务、讨论、项目整体）。

### 2.1 各任务的失败语义

- **成员发言**：抓不到新发言的成员直接出队；失败的成员队列延后 60 秒，模型 503 / 超时类延后 300 秒；run 记 `failed` 可重试。
- **文档摘要**：非文本且没有候选摘要的版本只留一次 30 天兜底，不做每日空跑；失败延后 60 秒。
- **迭代归档**：draft 阶段硬校验「是否逐个覆盖全部未完成任务」，漏一个或多个就整轮失败；归档被撤回或方案变化时记 `completed` 且 `discarded`。
- **项目记忆**：零产出合法（`had_updates=false`，不写条目）；只有产生变更才清队列；整批写入在一个事务里，不留半成品。

### 2.2 过程轨迹

每次维护都往 `agent_project_events` 写阶段行：`prepare_context` → `start_harness` →（必要时）`compact_context` → `model_run` → `validate_result` → `save_checkpoint`。每行带一句 `summary`（输入条数、上下文用量、模型结论摘要、校验字段等）和 `trigger_source`（`schedule` 定时 / `user` 手动）。轨迹是排查「老翁到底卡在哪一步」的第一手材料。

### 2.3 五类记忆作业口径（调优清单）

口径的单一事实源是 `shared/memory-jobs.js` 的 `MEMORY_JOBS`；管理视图 `GET /api/projects/:id/memory/jobs` 返回口径 + 最近一次运行 + 积压，只读、不触发作业。

| 作业                          | 触发                                                 | 完成标准                                                                            | 失败补救                                                   |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `member_memory` 发言记忆      | 成员有新发言，已读序号落后；一次最多 50 人           | 每个有新发言的成员一条 `utterance` 页面（`about_user_id` + 消息出处），推进已读序号 | 成员级延后 60 秒，模型 503/超时延后 300 秒；run 失败可重试 |
| `document_memory` 文档记忆    | 正式文件新版本到期；zip 自动列清单、图片记尺寸       | 单文档记忆更新 + 组条目同步，出处指向版本                                           | 非文本无候选只做 30 天兜底；解析失败降级为类型/大小/sha256 |
| `task_memory` 任务记忆        | 任务终态、重试或返工（随结算承接）                   | 重要任务一条 + 每迭代一条任务分布                                                   | 统计失败不写半条，下次结算重算                             |
| `discussion_memory` 讨论记忆  | 迭代静默、累计消息、决策信号、归档前；至少两人同话题 | 一条讨论记忆 + 参与者 `relates` 边 + 出处                                           | 保留候选下次合并；话题归一键防重复                         |
| `project_memory` 项目整体记忆 | 候选 ≥ 40、最久等 20 分钟、urgent、手动刷新          | 结算写库 + 出处 + 变更日志；有变更才清队列                                          | 队列保留可重试；update 只改 draft                          |

**事实源与缓存**：三张摘要表（成员认识 / 文档摘要 / 项目导读）已降级为 wiki 的读取缓存，写 wiki 后由 `memory-cache.js` 刷新（结算、发言写入、文档版本同步、回填）；成员认识、项目导读（含协调器 prompt 与项目列表）、文档摘要索引均已改为 wiki 优先 + 缓存兜底，结算会补建项目整体页。

**存量数据**：历史条目（`subject_type` 为空）不会被删除，界面上用「未分类」筛选可见；「回填历史」按钮（`POST /memory/backfill`）按出处归类，并把旧成员/文档摘要折算进发言记忆、文档记忆，归档迭代补讨论记忆，最后补任务与项目整体页，重复执行不重复建条。旧条目没有关系边属正常，可在详情里手动补。

可用性评估（走查结论、模型依赖边界）见 `14-project-memory-usability.md`。

调优顺序：先改 `MEMORY_JOBS` 的口径，再改对应实现；管理视图用来确认「最近一次是否按新口径完成」。

**项目级覆盖**：`memory_job_settings`（迁移 139）存 `enabled` / `trigger_threshold` / `prompt`。停用后该作业的触发接口返回 409、自动排空跳过；`trigger_threshold` 作为 `project_memory` 的触发条数（默认 40）；`prompt` 非空时追加到结算提示词的「项目口径补充」。面板可改可回滚，`PATCH/DELETE /api/projects/:id/memory/jobs/:key`。

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

| 事件           | 位置                           | 写入                                                                                 |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| 群聊消息       | `server/service-messages.js`   | `source_kind='message'`，有正文且非 system 才记                                      |
| 任务状态变更   | `server/task-pool-activity.js` | `source_kind='task'`，`urgent=true`                                                  |
| 正式文件新版本 | `server/documents/versions.js` | `source_kind='document_version'`，仅 `folder_kind='project_official'`，`urgent=true` |

- 唯一键 `(project_id, source_kind, source_id)`，重复只刷新 hint 与可用时间。
- 结算条件：待处理 ≥40 条 / 最早一条静默 ≥20 分钟 / 事件型 urgent / 手动刷新。
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

**HTTP**：`GET/POST /api/projects/:id/memory`、`/memory/counts`、`/memory/jobs`（五类口径 + 最近运行 + 积压，只读）、`/memory/jobs/:key`（PATCH 改口径、DELETE 回滚）、`/memory/jobs/:key/retry`（重试）、`/memory/discussion/:threadId`（讨论记忆手动补跑）、`/memory/relations`（建/删关系）、`/memory/entries/:entryId`（改对象类型）、`/memory/refresh`；`POST /member-memory`、`/document-memory`、`/project-document-memory`、`/iteration-document-memory`、`/iteration-archive`；`GET /laoweng-sessions/:task`；`POST /laoweng-context/compact`。

**界面**：小祥监控只保留小祥与子 Agent 的调度/执行，老翁相关内容已移除；老翁的轨迹、运行历史、维护会话、立即运行、口径调整都在「项目记忆 → 记忆作业」里（监控接口的 knowledge 字段暂保留，界面不再使用）。

排查顺序：`get_laoweng_status` 看会话与队列 → `get_laoweng_logs` 看停在哪一阶段 → `retry_laoweng_task` / `/memory/refresh` 重试。

## 7. 遗留命名与已知差异

- **历史命名已统一**：角色键只有 `laoweng`/`xiaoxiang`/`child_agent`（迁移 128）。本次把仍在使用的旧分级唤醒事件键并入 `child_idle`（迁移 135，含存量行改写）。管理页 `visibleAgentText` 只是历史文本翻译表，把旧提示词/插件名显示成当前成员名，不参与运行。
- **文档整理已下线（2026-10-25）**：入口、调度、UI 都撤了，作业表与任务键保留供读历史。它的运行记录从来不在 `agent_laoweng_runs`（写 `document_organization_jobs`），所以 `get_laoweng_status.recentRuns` 与 `list_laoweng_runs` 都不含它。
- **记忆详情缺创建时间**：后端条目目前只返回 `updatedAt`。
- **存量手写知识页**：只读保留，等老翁首次全量清算给出合并/替代建议，人确认后再处理。
