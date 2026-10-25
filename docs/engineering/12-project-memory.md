# 项目记忆：实现契约

状态：进行中（2026-10-25 起）。本文是实现契约，随代码同步更新。

## 1. 定位

项目记忆 = 老翁持续整理 + 人确认与纠错 + 迭代归档清算 + 项目归档封存。

- 不做独立的「知识库」检索入口，也不做向量库；复用现有知识页表。
- 两类读者：新人看沉淀（导读 + 现行条目），老成员看过程（时间线 + 变更摘要）。
- 人只做三件事：过程确认、纠错标注、迭代清算清单确认。不写正文。

## 2. 数据模型（记忆即 wiki，另加关系网）

| 记忆概念 | 复用对象                   | 说明                                                                                                                                                                                                |
| -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 记忆条目 | `wiki_pages`               | kind 与 status 语义重定义；新增 `subject_type`（utterance/document/task/discussion/project）标明记的是谁；发言记忆用 `about_user_id` 指向说的是谁；`recall_count` / `last_recalled_at` 记召回活跃度 |
| 出处     | `wiki_page_sources`        | message / document_version / task / archive / thread（讨论记忆挂迭代）                                                                                                                              |
| 关系     | `memory_relations`         | 记忆之间织网：`relates` 关联、`derives` 继承（单向防环）、`supersedes` 替代                                                                                                                         |
| 导读     | `agent_project_summaries`  | 老翁维护，更新式，进入首页顶部                                                                                                                                                                      |
| 时间线卡 | `threads.archive_snapshot` | 不可变，含 conclusion / taskDecisions / nextThreadId                                                                                                                                                |
| 新人判定 | `members.tab_opened_at`    | 为空即从未进入；关闭页签不清除它                                                                                                                                                                    |

### 2.1 五种页型的用途

| kind              | 主要读者 | 产出方式                                               |
| ----------------- | -------- | ------------------------------------------------------ |
| `retro` 复盘      | 老成员   | 归档确认事务内自动生成，作为该轮时间线卡详情           |
| `decision` 决策   | 两者     | 归档确认事务内生成；后续被推翻时 superseded 并保留历史 |
| `status` 当前状态 | 新人     | 日常结算更新，构成导读的正文                           |
| `guide` 指南      | 新人     | 日常结算或清算生成                                     |
| `glossary` 术语   | 新人     | 日常结算生成                                           |

### 2.2 status 状态机

| 转移                     | 触发                           | 执行者                                                       |
| ------------------------ | ------------------------------ | ------------------------------------------------------------ |
| 新建 `draft`             | 日常结算（消息/任务/文档版本） | 老翁                                                         |
| `draft` → `current`      | 过程确认，或迭代清算清单确认   | 人                                                           |
| `draft` 保留             | 清算时未确认                   | 系统；不转正，只计数提示                                     |
| `current` 小修           | 日常结算补充进展               | 老翁；写 updated_at，前端标「最近变化」                      |
| `current` 冲突           | 日常结算发现结论相反           | 老翁标争议，**不覆盖现行**，等人在过程中裁决                 |
| `current` → `superseded` | 清算或人裁决后                 | 老翁执行；保留可查                                           |
| 项目封存                 | 项目归档                       | 项目对成员关闭，记忆随之不可读写；管理员恢复项目后才能再打开 |

问答（问老翁）只消费 `current`，草稿不参与回答。

## 3. 接口契约

### 3.1 新增

`GET /api/projects/:id/memory` —— 弹窗首屏数据，项目成员可读。

```json
{
  "guide": {
    "text": "",
    "updatedAt": null,
    "basedOn": { "iterationId": "", "title": "", "archivedAt": null }
  },
  "counts": { "drafts": 0, "disputes": 0, "updatedSinceEntry": 0 },
  "timeline": [
    {
      "iterationId": "",
      "title": "",
      "archivedAt": null,
      "conclusion": "",
      "memoryChanges": { "added": 0, "updated": 0, "superseded": 0 },
      "taskDecisions": [{ "taskId": "", "title": "", "disposition": "", "reason": "" }],
      "keyVersions": [{ "versionId": "", "artifactId": "", "title": "", "version": 0 }],
      "pageIds": []
    }
  ],
  "entries": [
    {
      "id": "",
      "kind": "status",
      "title": "",
      "body": "",
      "status": "current",
      "updatedAt": null,
      "createdBy": "",
      "sources": [{ "sourceKind": "archive", "sourceId": "", "label": "" }]
    }
  ]
}
```

`GET /api/projects/:id/memory/counts` —— 左侧入口小点用。返回 `{ drafts, disputes, updatedSinceEntry }`，`updatedSinceEntry` 统计当前用户 `tab_opened_at` 之后有更新的条目数；未进入过项目时为全部现行条目数。

`POST /api/projects/:id/memory/entries/:entryId/confirm` —— `draft` → `current`，返回更新后的条目。只允许项目成员（viewer 除外）。

`POST /api/projects/:id/memory/entries/:entryId/flag` —— 纠错标注，body `{ note }`。写 `project_change_logs`（action=`memory_entry_flagged`），并置条目 `disputed_at`，供下次结算读取。**不改正文**。

`POST /api/projects/:id/memory/refresh` —— 触发老翁 `project_memory` 任务，202 返回该 run 记录（`id`/`task`/`status`/`item_count`/`error` 与三个时间戳）；同项目已有 queued/running 时复用既有 run。请求会当场内联推进最多 3 批，模型慢时 HTTP 会等待；失败留在 run 记录里，不回滚已写草稿。

项目归档后成员无法访问项目（`members` 权限查询带 `p.archived_at IS NULL`），记忆接口返回 403；确认、纠错与知识页写入另有 409 的防御性拦截，防止将来放宽项目访问时误写封存记忆。

### 3.2 修改

- `PATCH /api/threads/:id/archive/confirm`：响应增加 `settlement`；同一事务内执行：该轮已确认草稿转正、未确认草稿保留、冲突条目标争议、生成复盘页与决策页。
- 知识页写接口已下线：`POST /api/projects/:id/wiki-pages` 与 `PATCH .../wiki-pages/:pageId` 都返回 409，人改记忆只能走「确认」与「纠错」。读接口（列表、详情）保留，供问老翁引用定位使用；右侧栏「知识页」tab 已下线，引用直接打开项目记忆并选中该条详情。服务层也删掉了改正文的入口（`updateWikiPage` 已移除），只保留 `createWikiPage` 供归档生成与测试夹具使用。

### 3.3 不改

`wiki_questions` / `wiki_answers` / `wiki_answer_citations`、组织架、参与组织简报、文档库全部不动。

## 4. 老翁任务 project_memory

- 任务名：`project_memory`，复用 `agent_laoweng_runs`（task 枚举扩展）与 `processNextProjectMemory` 分发。
- 触发：候选队列达到阈值或静默到点、事件型（任务完成、正式文件新版本）、手动 refresh、归档清算后。
- 输入：候选队列条目 + 现有条目索引（title / kind / status）+ 当前导读。
- 输出 JSON：`{ "entries": [{ "op": "create|update|dispute", "entryId"?, "kind"?, "title"?, "body"?, "sourceIds": [] }], "summary": "..." }`。`kind` 只能是 `guide`/`decision`/`retro`/`glossary`/`status`，`entryId` 仅在 `update`/`dispute` 时必填；同主题按 `kind + title` 归并（没有独立 topic 字段）。导读不在这条任务的输出里，由迭代归档的 memory 阶段写 `agent_project_summaries`。
- 幂等：队列唯一键（project_id, source_kind, source_id）防重复；同主题按 `kind + topic` 合并。
- 零产出合法：`had_updates=false`，不写条目。
- 失败：run 记 failed，可重试；条目写入在事务内，不留半成品。

## 5. 候选队列

迁移 `132_project_memory_queue.sql`：

```sql
CREATE TABLE agent_project_memory_queue (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  source_kind ENUM('message','task','document_version','archive','manual') NOT NULL,
  source_id CHAR(36) NOT NULL,
  hint VARCHAR(255) NOT NULL DEFAULT '',
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY agent_project_memory_queue_source (project_id, source_kind, source_id),
  KEY agent_project_memory_queue_ready (project_id, available_at),
  CONSTRAINT fk_apmq_project FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

轻标记在消息写入、任务状态变更、正式文件新版本三处各插一行（不做模型调用）。结算条件至少命中一个：待处理 ≥40 条、最早一条静默 ≥20 分钟、事件型存在（任务状态变更、正式文件新版本带 urgent）、手动刷新。40 同时是单次结算的候选上限（`PROJECT_MEMORY_BATCH_LIMIT`）。

`source_kind` 另有 `archive`：迁移 132 预留、读取侧已支持，但当前没有写入方——归档内容走 `wiki_page_sources.source_kind='archive'` 和归档 memory 阶段的长期总结，不进候选队列。

## 6. 前端

- 新组件 `web/ProjectMemory.tsx`：`Dialog` 默认带 `dialog-fullscreen`；内部左右 6:4——左栏导读（Markdown + 计数摘要 + 刷新），右栏时间轴：左侧圆点+竖线，右侧第一条为时间与类型、第二条为标题卡片，可搜索，点卡片打开二级「记忆详情」弹窗（正文、出处、所属迭代、确认/纠错）。窄屏（<960px）上下堆叠。
- 入口：`WorkspaceSidebar` 底部「项目记忆」卡片，与「项目管理」并列。
- 首次自动打开：项目激活时若该用户的 `tab_opened_at` 为空 → 打开记忆并调用 `updateProjectTab(id, "open")`；之后不再自动打开。
- 组织主页直达：`OrgHome` 的项目名改为链接 `/?projectId=<id>&memory=1`；`WorkspaceApp` 读取后清除参数。
- 小点：`counts.drafts + counts.disputes > 0` 或 `counts.updatedSinceEntry > 0` 时入口显示提示点。

## 7. 验收

- 新人判定用 `tab_opened_at IS NULL`；关闭页签再进入不重弹。
- 日常结算产出 draft；人确认后 current；问老翁只读 current。
- 归档清算返回 settlement 且可重跑，不重复生成页。
- 组织主页点项目直达记忆。
- `npm test` 通过；`npm run build` 通过。

## 8. 实施顺序

1. 契约与数据结构：本文、迁移 132、`GET memory` 与 `GET memory/counts`。
2. 前端：全屏弹窗（读）、左侧入口、首次自动打开、组织主页直达。
3. 老翁 `project_memory`：轻标记入队 + 结算产出草稿。
4. 清算：归档确认返回 settlement、条目确认与纠错接口、争议处理。
5. 收口：关闭手写新建、手册补「项目记忆」、清理旧文案。

## 9. 风险

- 老翁叙述失真：出处必留，草稿不参与问答，人可纠错。
- 记忆抖动：变更提示、确认机制、旧版保留。
- 成本：轻标记不调模型；结算去抖；零产出合法。

## 10. 实现状态（2026-10-25）

已落地：

- 迁移 `132_project_memory_queue.sql`；队列表按 §5。
- 迁移 `137_memory_subjects_and_relations.sql`：`wiki_pages` 增加 `subject_type`（五类记忆）、`recall_count`、`last_recalled_at`；`wiki_page_sources` 出处补 `thread`；新建 `memory_relations`（relates / derives / supersedes）。
- `shared/memory-kinds.js`：五类记忆、中文标签、Markdown 骨架；`server/memory-graph.js`：建/删关系、单条直接关系、最多 3 跳召回、召回计数，继承成环返回 409。
- 结算写入带 `subject`：`project_memory` 输出的条目可指定对象类型，`applyProjectMemoryResult` 落 `subject_type`，`update` 时保留原值。
- `server/memory-timeline.js`：读侧聚合、counts、confirm、flag、`settleIterationMemory`、争议推导 `disputedEntryIds`。
- 记忆作业面板：五类口径、积压、最近运行、立即运行、调整口径、失败重试、讨论补跑、回填历史；每个维护作业可看轨迹（agent 日志）、运行历史、维护会话；老翁已不在一级监控页出现。
- 管理侧写接口：`POST/DELETE /memory/relations` 建删关系、`PATCH /memory/entries/:entryId` 改对象类型与归属成员（`aboutUserId` 需为项目成员），均要求写权限。
- 读侧条目带 `subject`（五类对象）与 `relations`（关联/继承/替代，含方向与对方标题），`GET /api/projects/:id/memory` 与单条详情一致。
- 路由：`GET /api/projects/:id/memory`、`GET /api/projects/:id/memory/counts`、`POST .../memory/entries/:entryId/confirm`、`POST .../memory/entries/:entryId/flag`、`POST .../memory/refresh`（202）。
- 归档确认：`POST /api/threads/:id/archive/confirm` 支持可选 `confirmedEntryIds`，响应带 `settlement`；重复确认走 `apply=false` 只读重算。
- `server/document-memory.js`：正式文件新版本落库后同步写单文档记忆（种类、大小、关键版本、变更要点、怎么读），并按所在文件夹聚成「文档组：<文件夹>」条目，组与成员用 `relates` 相连；zip 用 jszip 列文件清单（文件数、顶层、前 20 个文件名），图片用 sharp 记尺寸与格式；tar.gz 等暂不解析，正文标注需解压。
- `server/utterance-memory.js`：发言记忆落 wiki——`upsertUtteranceMemory` 每个成员一条 `subject=utterance` 页面（`about_user_id` 唯一，滚动更新正文、出处去重），`saveMemberUnderstandings` 在写旧表后同步落 wiki；旧表 `agent_member_summaries` 降为读取缓存。
- **单一事实源（方向 A）**：事实在 `wiki_pages`（+ 出处 + 关系）；`agent_member_summaries` / `agent_document_summaries` / `agent_project_summaries` 降级为缓存，由 `server/memory-cache.js` 从 wiki 刷新：
  - 成员认识：会话结算 apply 后按 `subject=utterance` 刷新；`loadMemberUnderstanding` 已改为 wiki 优先、旧表兜底；
  - 项目导读：结算 apply 后按 `subject=project` 刷新（占位页不覆盖）；
  - 文档摘要：正式版本同步文档记忆后按 `变更要点` 刷新该版本缓存；
  - 回填结束统一 `refreshAllCaches`。
    已切换：`loadMemberUnderstanding`、`loadProjectWikiIndexes`（成员认识；文档摘要缓存缺失时用文档记忆补最新版本）、`loadProjectSummary`（协调器 prompt、项目列表/详情导读）、结算时补建项目整体页。仍以缓存为读来源的只有「旧版本文档摘要」与成员队列 `through_sequence` 语义，属缓存自身数据。
- 存量回填：`backfillProjectMemory` / `POST /memory/backfill`（幂等）：按出处把 `subject_type IS NULL` 的旧条目归类；`agent_member_summaries` → 发言记忆；`agent_document_summaries` → 文档记忆「变更要点」；归档迭代补讨论记忆；再补任务分布与项目整体页。
- 召回入口：老翁经 MCP `search_memory`，小祥与子 Agent 经 `server/agent-tools.js` 的 `search_memory` 分发（能力键 `project_memory_recall`，工具参数 query/subjects/aboutUserId/status/depth/limit）。
- 统一重试：`retryMemoryJob` 按作业键分派（`project_memory` → 手动结算，`member_memory`/`document_memory`/`iteration_archive` → 排队并内联跑一批；任务/讨论记忆随结算，返回 409）。
- 可用性评估结论与限制见 `14-project-memory-usability.md`。
- 迁移 `139_memory_job_settings.sql`：项目级口径覆盖（`enabled` / `trigger_threshold` / `prompt`），停用与阈值已接入 `maybeQueueProjectMemoryRun`、`queueLaowengMemoryRun`、`queueProjectMemoryRun`，提示词覆盖追加到结算 instructions。
- `shared/memory-jobs.js` + `server/memory-jobs.js`：五类记忆作业的触发、提示词、工具、完成标准、失败补救口径；管理视图 `GET /api/projects/:id/memory/jobs` 返回口径、最近一次 `agent_laoweng_runs` 与积压（发言/文档/项目队列），只读。
- `server/memory-search.js`：`searchProjectMemory` 按对象类型 / 成员 / 关键词检索（ngram，未命中回退 LIKE），按关系展开 1 跳，返回出处并累计召回；MCP 只读工具 `search_memory` 已注册，问老翁经 `callMcpTool` 自动带 projectId 调用，引用映射到记忆出处（消息 / 文档版本 / 任务 / 迭代）。
- `server/task-memory.js`：任务记忆聚合（耗时、重试、返工、坑，状态与执行者分布），提供 `loadTaskMemoryStats`、`importantTasks`、`taskMemoryMarkdown`、`taskDistributionMarkdown`；结算候选的任务信号已带执行者类型、执行次数、失败次数、重试与最近错误，按提示词拆成「重要任务单条 + 迭代任务分布」。
- `server/discussion-memory.js` 另有 `syncThreadDiscussionMemory` 宽窗口版：扫一整个迭代的可见发言（≤500 条），生成/更新一条「讨论：<迭代名>」记忆，挂迭代与消息出处、连参与者发言记忆，并用 `derives` 继承到项目整体；归档确认后自动执行，也可 `POST /api/projects/:id/memory/discussion/:threadId` 手动补跑；受 `discussion_memory` 口径开关控制。
- `server/discussion-memory.js`：讨论记忆写入原语——`upsertDiscussionMemory` 按话题归一键（标题去空白与标点）跨迭代合并、出处去重；`linkDiscussionParticipants` 从消息出处反查参与者，把各自发言记忆用 `relates` 连到讨论记忆；结算写 `subject=discussion` 条目后自动连边。
- 老翁 `project_memory` 任务：`noteProjectMemorySignal` 轻标记、`maybeQueueProjectMemoryRun` 阈值/事件触发、`processNextMemorySettlement` 结算、`queueProjectMemoryRun` 手动刷新；任务已注册进 `LAOWENG_MAINTENANCE_TASKS`。
- 三处轻标记：消息写入（`server/service-messages.js`）、任务状态变更（`server/task-pool-activity.js`）、正式文件新版本（`server/documents/versions.js`）。
- 前端：`web/ProjectMemory.tsx` 全屏弹窗（7:3：导读 / 带搜索的倒序记忆时间轴 / 记忆详情二级弹窗）、左侧「项目记忆」卡片与小点、首次进入自动打开、`?projectId&memory=1` 直达；归档确认后提示清算摘要。
- 迭代清算的人工校准：归档详情返回本轮记忆草稿 `memoryDrafts`，归档确认页可逐条勾选，勾选的条目在确认事务里转正。
- 项目归档封存：项目归档后成员失去项目访问权（`p.archived_at IS NULL` 权限门槛），记忆读写都不可达；确认/纠错/知识页写入另有 409 防御拦截。
- 人不再手写知识页：知识页 HTTP 写接口下线；右侧栏「知识页」tab 一并下线，问老翁引用改为打开项目记忆并聚焦该条。
- 记忆详情弹窗按可读性打磨：头部 meta（类型 / 状态 / 争议 / 更新时间）、正文限宽与行高、所属迭代与出处各成卡片、底部操作条固定。
- 时间轴支持按状态筛选（默认只看草稿与现行），卡片右上角显示状态中文标签。
- 主弹窗与详情弹窗都带全屏切换；详情底部不再放关闭按钮（走头部 X 与 Esc）。
- 确认与纠错都先弹二次确认，确定后才调用接口，避免误点改变记忆状态。
- 使用手册 `public/docs.html` 增补「项目记忆」章节。
- 测试：`tests/project-memory.test.js`（入队与结算、确认与纠错、迭代清算与重放）。
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
