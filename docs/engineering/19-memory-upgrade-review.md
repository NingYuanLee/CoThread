# 记忆作业升级核对与修复

2026-11-03 追加：记忆两态、三来源治理、固定历史出处与最新验证边界，以 [按来源治理方案及实施记录](20-memory-source-lifecycle-plan.md) 为准。本页保留各专项设计与历史评估，不能沿用旧草稿/转正语义。

2026-11-04 简化：项目现状改为每项目一份 Markdown（`project_status`），随项目进程结算覆盖。本页 M03、现状指纹刷新、修订与来源快照相关描述已下线，见 [项目进程设计](18-project-process-design.md)。

核查日期：2026-11-03（北京时间）。对象为当前未提交工作区。用户确认修复后，已实现以下五项修复；该轮修复当时没有部署、提交或推送；后续已随提交 `7316999` 于 2026-11-04 发布上线。验证范围见文末，历史验证不能代替当前代码验收。

## 问题与修复

| 编号 | 优先级 | 已确认问题                                     | 修复方式                                                   |
| ---- | ------ | ---------------------------------------------- | ---------------------------------------------------------- |
| M01  | P1     | 来源变化后冻结窗口永久重试，阻塞同迭代后续消息 | 来源失效终止状态与后继窗口，保留旧来源、失败候选和成功产物 |
| M02  | P1     | 工具桥绕过文件索引可见性，直接读取存储正文     | 对齐正式接口的可见性、出处过滤与动态正文装配               |
| M03  | P2     | 现状正文不变时不更新来源指纹，复核后仍待核实   | 将已核验证据带入事务复查，只刷新指纹而不虚增正文修订       |
| M04  | P2     | 旧成员队列清理未保存无法迁移项的审计           | 新增排序在 156 之前的审计迁移，保存游标及分类              |
| M05  | P2     | 缺少文件识别覆盖、问题明细与单文件重试         | 补齐统计、最多 20 个问题文件、原因和重试接口及界面         |

### M01：来源变化与窗口恢复

实现：`server/conversation-memory-context.js`、`server/conversation-memory-store.js`、`server/conversation-memory-runner.js`、`migrations/161_conversation_window_recovery.sql`；同步调整调度、监控和积压统计。

- 来源变化使用独立错误类型，区别于临时模型故障。旧窗口设置 `invalidated_at`，保留冻结指纹、错误、候选及修订，不冒充成功。
- 事务中冻结仍可读取的当前消息，通过唯一 `predecessor_id` 建立后继窗口；重复调用不重复建窗。全部来源删除时保留旧窗口，放行后续消息。
- 没有成功候选时重新联合分析；已有部分成功时保留成功页面身份，未完成项必须基于新来源重新分析、核验，不直接重放旧模型结果。
- 来源变化后确已没有可保存内容时，允许重分析返回带明确原因的零产出，须独立核验并在事务内复查来源；以候选修复记录保存结束原因，不创建页面，也不计入新增记忆数量。
- 未完成候选全部出处不可读时，原失败项留在旧窗口供人工核对，不复制成永久阻塞项。已保存但来源变化的页面仍显示待核对。
- 面板显示来源失效；调度、积压统计和新窗口阻塞判定排除失效旧窗口。

### M02：工具桥读取边界

`server/conversation-memory-tools.js` 的 `read_memory` 使用 `visibleFileIndexSql`、`visibleFileSourceSql`，并动态装配根导航、关联组和文件路径，与正式详情入口一致。乐观并发快照仍保存原始数据库正文，避免动态正文影响写入指纹。对话旧页例外仅限本轮明确包含的失效页，不能绕过文件可见性。查询仍绑定当前项目。

### M03：现状来源复核

实现：`server/project-memory.js`、`server/project-status-node.js`。

- `unchanged` 在核验前读取旧出处的当前快照，同一份证据交给独立核验器并带入提交事务。不能事后读取新指纹冒充已经核验。
- 提交时锁定来源并复查可访问性和指纹；核验后再次变化则拒绝提交，保留候选重试。
- 同正文、同出处集合的 `update` 也刷新已核验指纹，不新增正文历史，不重建出处或关系。
- `unchanged` 保留原正文（包括末尾空白）；结算在首次一致性读取前锁定证据，避免 MySQL 可重复读事务使用早于核验的快照。已完成的结算先按检查点返回，不因后来的来源变化重复处理。

### M04：旧队列迁移审计

新增 `migrations/155_legacy_member_queue_audit.sql`，原 156 迁移及校验和保持不变。`legacy_member_queue_audit` 记录项目/用户身份、待处理与已汇总游标、可读待处理数量、分类、采集时间和切换是否已执行；不记录正文或密钥。分类为可迁移、已处理、需要人工核对。没有可读来源不再一概解释为旧提及空队列。重复执行保留首次快照。

**恢复边界：**尚未执行 156 的库先采集审计；已经执行 156 并清理旧队列的库只能记录剩余项，无法凭新迁移恢复此前清理的队列行，也无法恢复已删除原文。历史缺口需用迁移前备份排查。

### M05：文件作业管理

实现：`server/file-index-jobs.js`、`server/memory-jobs.js`、`server/project-memory.js`、`server/routes/project-workspace.js`、`web/ProjectMemory.tsx`。

- 按当前有效、未回收的资料库文件统计“识别完整”“识别部分”“暂不支持”“等待识别”四类识别结果，每个文件只计最新可用版本；四类互斥，合计等于文件数。读不出内容（格式不支持、乱码等）计入“暂不支持”并保留原因；处理失败属于处理状态（处理过程故障，按退避自动重试，最多 5 次后停止自动重试），不改变识别结果。
- 最多展示 20 个问题文件，提供版本、状态、原因、下次尝试及可用详情入口。处理状态中，已有识别结论（识别完整、识别部分、暂不支持）的统一为处理成功；只有等待识别的文件才细分处理中、排队中、处理失败。模型出错记为处理失败，不支持的格式保留暂不支持的原因。
- 单文件重试检查写权限、归档状态、文件及版本可访问性；与后台识别共用命名锁。获取锁后版本已变化时拒绝操作，要求刷新。

## 测试库连接更正

`.env` 已有完整独立测试库配置。此前“缺少配置”判断不准确；直接执行 Node 需要加载 `.env`，`npm test` 已加载。此前 991 项中 511 通过、480 失败，大量错误发生在 MySQL 初始化，早于业务断言，不能视为 480 个业务缺陷。

本机 DNS 把公网 RDS 域名解析到 `198.18.0.0/15` 地址，TCP 探测成功但 MySQL 握手失败。通过阿里 DNS over HTTPS 获取真实地址，仅在测试进程中覆盖地址后，`SELECT 1` 成功，数据库回归能够执行。这确认了两条解析路径的行为差异，不能据此断言具体代理设置的责任。未修改 `.env`、系统 DNS、生产连接或应用连接逻辑，未将可变化的 RDS IP 固定进代码。测试使用 `DATABASE_ENDPOINT=public`、`COTHREAD_DB_TARGET=test`，保留独立库名称保护和测试库锁。

远程清理优化只涉及 `tests/database.js`：用受保护测试库的元数据批量生成 DELETE，减少逐表网络往返，保留事务、失败回滚、外键恢复和正式库拒绝逻辑；多语句只启用于测试控制连接。

## 本轮验证

- 构建、lint、差异空白检查已通过；构建保留既有 Vite 分包及依赖指令告警。
- 稳定迁移后的首轮专项回归 63/63 通过；无数据库单元测试 476/476 通过。新增 `tests/memory-upgrade-review.test.js` 覆盖部分成功窗口恢复、文件工具桥/统计/重试、现状指纹刷新与核验竞态、旧队列审计和迁移回执丢失后的重试；原删除来源用例补充后续消息推进断言。随后加强格式异常候选、版本回收、物理清除和实际模型失败状态的检查。
- 全量回归执行 990 项：989 通过、1 失败，唯一失败是 `renovation-d.test.js` 以固定 400 毫秒判断并行重叠的用例。该测试已改为同步屏障，验证不同迭代实际同时进入执行，同一迭代在首条执行期间拒绝竞争领取，结束后下一条仍可执行；改后定向复测通过。
- 最终代码定向回归 39/39 通过，覆盖 `memory-upgrade-review`、`conversation-memory-store`、`memory-jobs`、`project-status-node`、`renovation-d` 五个测试文件，包含全量运行期间补充的零产出恢复、原文末尾空白保留与来源核验竞态检查。最终代码没有再跑整套 990 项，不将上述结果表述为最终代码全量通过。
- 首轮专项期间迁移曾调整，测试框架缓存校验和导致反复重建结构；该轮已中止，迁移稳定后重新运行。中止运行不计为通过。

## 尚无新内容时的模型调用（2026-11-04 追加）

用户反馈线上开着应用时记忆作业持续消耗 token。排查后确认：作业本身按“有新内容才排队”调度，但**同一份内容会被反复送进模型**——失败重试固定 60 秒（项目记忆、文档摘要）或 5 分钟（待观察问题复核）无上限，项目记忆的结算身份又按队列行 id 计算，同一批内容重新命中信号后会被再分析一次（本地库两天内 90 次失败重试、25 次零产出运行均属此类）。

改动：

- 新增 `server/memory-retry.js`：失败后按 `[60,300,1800,7200,21600]` 秒退避（待观察问题复核用 `[300,900,3600,21600,86400]`），最多自动重试 5 次；仍失败则把队列推到远期并写明「已停止自动重试，需要人工重试」。停止只影响自动重试，管理面板的立即运行/重试仍可手动触发。
- 项目记忆结算身份改为「候选内容指纹 + 项目现状」哈希：同一份内容、同一项目现状再次命中信号时复用上次结算结论、直接把队列行出队，`agent_called=false`，不再调用模型；内容或项目现状变化才重新分析。
- 文档摘要：同一版本已有摘要且触发来源不是手动重试时直接出队，不调用模型；失败重试改用同一退避策略。
- 联合记忆窗口、候选与待观察问题复核的失败排期统一走同一策略（原先分别按 60 秒/1 小时/24 小时与 5 分钟固定重试）。
- 口径同步：`shared/memory-jobs.js` 的失败补救文案、`13-laoweng-workloads.md`、`17-file-index-design.md` 已更新。

验证：`tests/memory-retry.test.js` 6 项纯单元用例通过（退避阶梯、停止文案、结算身份同内容复用/内容变化重算、已摘要文档只在非手动重试时出队）；`tsc --noEmit` 通过；无数据库单元测试逐文件执行 96/110 文件通过，14 个失败均为本机沙箱的 spawn/mkdir/DPAPI 限制（esbuild 服务、DSH 运行时、`.<local>` 沙箱目录），与本次改动文件无关；`lint` 的 5/6 子检查通过，`check-theme-generated` 因 spawn 被沙箱拒绝未能执行。测试库 RDS 从本机仍报 `PROTOCOL_CONNECTION_LOST`，数据库用例（含记忆作业相关集成用例）本轮未执行，不视为已验证。线上效果需部署后从「记忆作业」运行历史确认：同内容不再重复出现 `agent_called=true` 的运行。

## 零产出自动运行（2026-11-04 第二轮）

用户从「记忆作业 · 项目进程与主要任务」历史里指出：多批“自动运行”的「新内容」为暂无，但「调用Agent」为是。核对本机库后确认两条成因：

- **项目记忆**：00:0x 的多条运行输入是 1–24 条 `memory_page` 候选（核心议题记忆页、关联文件索引页）。项目结算的完成标准明确规定议题由联合分析处理、文件索引由文档记忆处理，`applyProjectMemoryResult` 也拒绝写入议题类条目，所以这些候选结构上不可能产出项目级条目，每次只是一次无效模型调用。现在 `noteProjectMemorySignal` 直接忽略非项目级信号（只允许 `milestone` / `iteration_context` / `archive` / `task` / `document_version`），旧队列行在下一次调度时删除，结算查询也按白名单过滤。
- **发言与议题**：同一个失败窗口（`attempts` 达 15）在 15 分钟内被自动重跑 8 次，每轮都重新调用模型核验未变化的候选。现在已分析窗口（`response_saved=1`）的失败计数达到自动重试上限（5）时直接收口：保留候选失败记录、窗口写说明、不再自动调用模型；手动运行仍可再试。

验证：`tests/memory-retry.test.js` 增至 8 项（新增信号白名单与收口说明断言）全部通过；`tsc --noEmit` 与 prettier 检查通过。本轮仍未执行数据库用例（测试库 RDS 从本机 `PROTOCOL_CONNECTION_LOST`），线上效果需部署后从历史记录确认：项目记忆不再出现只有议题/文件索引输入的运行；同一失败窗口不再连续重跑。收口会把剩余失败候选标记为失败记录而不是静默丢弃，但自动重试不会再处理它们，需要人工在记忆作业里重试或重新分析。

## 删除文档后的失效项目进程信号（2026-11-04 第三轮）

用户从「记忆作业 · 项目进程与主要任务」指出：`丧事文案修改稿.wps · 重试 17 次 · 最近尝试 2026-11-04 03:40:44 · 已停止自动重试，需要人工重试：候选来源不存在或不可访问`。

核对「讣告排版」项目数据后确认：

- 该 wps 于 2026-10-31 09:13:53 上传到正式文件，09:16:38 被删除（artifact 软删除进回收站）；上传时写入的 `document_version` 信号没有随删除清掉。
- 结算加载候选时要求文档 `deleted_at IS NULL AND purged_at IS NULL` 且版本未进回收站，因此这条信号永远核验失败；11-03 13:07 那次成功结算消费完其它候选后，队列只剩它，14:08 起每小时结算都只剩这条死信号。每命中一次重试计数 +1（自动退避，加上人工「立即运行/重试失败运行」会把 `available_at` 重置为当前时间），5 次自动重试预算用尽后写「已停止自动重试」并把队列行推到 30 天后。
- 根因是删除路径不清理项目进程信号，且结算把「永久不可用」当成「暂时取不到」按退避重试。

改动：

- `server/project-memory.js` 新增 `dropDocumentVersionSignals`（按版本或文档清理信号）与 `dropUnavailableDocumentVersionSignals`（维护扫描清理失效信号）；`candidateTexts` 标记永久失效来源，`processNextMemorySettlement` 直接删除这些队列行，只剩它们时把运行收口为完成（不调模型、不写失败）。
- 删除路径接线：`server/documents/library.js`（整份删除、版本进回收站、文件夹级联删除、清空回收站）、`server/documents/versions.js`（同名合并软删）、`server/documents/service.js`（删除迭代连带删文档）；`library.js` 恢复正式文档时重新排一条 `document_version` 信号。
- `server/memory-maintenance.js` 每轮维护先清理失效信号，历史遗留行（包括已推到 30 天后的）会在下一轮 cron 被删掉，不依赖人工重试。

验证：`tests/project-memory-signal-cleanup.test.js` 6/6；相关 `project-memory`、`memory-retry`、`project-memory-signals`、`project-status`、`memory-jobs` 共 31/31；`document-memory` 15/15；`check-boundaries` / `check-overlays` / `check-field-resets` / `check-field-usage` 通过；`node --check` 通过。测试库 RDS 从本机仍 `PROTOCOL_CONNECTION_LOST`，数据库用例改用本机 3307 便携 MySQL 的 `cothread_test` 执行；`npm run lint` 因沙箱拒绝 spawn git 未能完整执行，`file-index-discovery` 4 项失败是本机沙箱 `.local\agents` mkdir EPERM，与本次改动无关。线上需部署后确认：该 wps 的队列行消失、项目记忆不再出现「候选来源不存在或不可访问」的按小时失败。

2026-11-04 已随当日第二次发布上线（包 `cothread-release-20261104T044635Z.tgz`，execution `exec-0c361976593d4107af3c`，`current` 为 `/opt/cothread/releases/20261104T044814Z`）。线上核对：`current/server/project-memory.js` 含 `dropDocumentVersionSignals`；该 wps 的 artifact 已置 `purged_at`、残留信号行删除（`signalsRemaining=0`），MCP `list_documents` 不再列出；手动 `project_memory` 结算 run `4f86f25f-89f4-4303-9d91-0938b03679db` 为 `completed`、`agent_called=0`，不再出现「候选来源不存在或不可访问」。发布细节与门禁见 `05-cloud-environment.md` 文末。

## 记忆作业项目进程 / 发言「无法处理」（2026-11-04 第四轮）

用户从「记忆作业」反馈：项目进程与发言两块似乎因为一些历史数据导致无法处理。核对 `get_laoweng_status`、`get_laoweng_logs`（项目 `8d0cf468`，时间为 UTC）后确认：

- **项目进程（结算校验失败）**：13:01 手动触发的运行 `76c709c7` 中，`model_run` 24 s 正常返回，`validate_result` 报 `invalid_type: Expected string, received null`（path `statusMarkdown`），整次判失败；错误文案是「项目记忆整理未完成。已停止自动重试，需要人工重试」——说明该批队列行的 `retry_count` 已被更早的失败累计到上限，新错误一出现就直接停止。
- **项目进程（更早的 12 次失败）**：12:34–13:28 每轮 `model_run`、`validate_result` 都成功，随后 `save_checkpoint` 报「老翁 会话快照超过 10 MiB」，共 12 次；同一会话 `90b324c6` 的历史在 12 次失败中反复累积。注意轨迹里的「上下文 3729 词元」是 `used/100` 的显示口径，实际约 37.3 万词元，历史并未回落；即使校验层修好，下一次成功结算仍会在保存快照时失败，所以本轮必须同时给快照超限加降级。
- **发言**：12:34–13:27 每次 `model_run` 前失败 `duplicate JSONL session id "91296140-…" appears in multiple project directories`（约 44 个输入）；这是第三轮已修的会话目录分裂问题，发布后 13:08 起连续 `{"supported":true}` 正常处理，未再复现。13:00 那次「部分候选未通过校验，可重试」是候选核验未通过后的正常退避，随后成功。

根因（三处在 `server/project-memory.js`，一处 在 `server/laoweng-agent.js`；前两处由当日上午 `7316999` 改造引入）：

1. 校验层 `statusMarkdown: z.string().optional().default("")`：zod/v3 的 `.optional()` 只接受 `undefined`，模型按「没有项目进程条目就不返回」写成 `"statusMarkdown": null` 时整份结果被拒。`summary` 同写法。
2. 写入条件 `if (created.length || updated.length)`：只提交任务/文档条目时也会调用 `writeProjectStatus(result.statusMarkdown)`，正文为空即抛「项目现状正文为空」，整批条目随事务回滚。提示词却写的是「只在提交了新增或更新项目进程条目时返回」，两处口径不一致，导致这批内容永远处理不了。
3. 失败预算被历史继承：人工「立即运行 / 重试」（`queueProjectMemoryRun`）只把 `available_at` 拉回当前，不重置 `retry_count`；`noteProjectMemorySignal` 在来源内容变化（`signal_revision` 递增）时也不重置。于是旧失败预算永久生效，任何新错误都立刻落成「已停止自动重试」。
4. 快照上限让维护会话本身卡死：`saveCheckpoint` 抛错即整次运行失败，而历史只增不减，于是形成 12 次连续失败；正确做法是本次结果照常落库并重置会话，而不是让作业永久无法处理。

改动：

- `projectMemorySchema`：`summary` / `statusMarkdown` 为 `null` 时视同未返回（`preprocess` 转空串），不再整份失败。
- `applyProjectMemoryResult`：只有提交项目进程条目（`subject=project`）或主动给出正文时才覆盖 `project_status`；本次只提交任务/文档条目且未给正文时保留原现状、条目照常写入；项目进程条目缺正文仍然整次失败。
- 提示词同步为「提交项目进程条目时必须返回 statusMarkdown；只提交任务或文档条目时可省略」。
- 新增 `resetProjectMemoryRetryBudget`，`queueProjectMemoryRun` 调用它重置排队行失败次数与上次错误；`noteProjectMemorySignal` 在候选提示变化时重置该行 `retry_count` / `last_error`。
- `server/laoweng-agent.js`：`saveCheckpoint` 超过 10 MiB 时改为重置维护会话（新 `session_id`、清空 `checkpoint` 与 `context_stats`、移走旧 `sessions` 目录，轨迹记「已重置维护会话」），本次已校验结果照常返回；`runLaowengTask` 与 `compactLaowengSession` 两条保存路径都走这个降级。`openLaowengHarness` 增加 `agentsRoot` 选项，仅用于测试注入可写目录（线上仍用 `.local/agents`）。

验证：`tests/project-status.test.js` 7/7（新增「只提交任务条目时可以不带项目现状」「项目进程条目返回 null 现状时整次结算失败」；前者在旧写入逻辑下实测为 `failed`，修复后 `completed`，已做反向验证）；`tests/project-memory.test.js` 7/7（新增「失败次数不跨内容变化与人工重试继承」）；`tests/laoweng-agent.test.js` 新增「会话快照超过上限时重置维护会话，本次结果照常返回」通过（该文件另 4 项仍失败于本机 `.local\agents` mkdir EPERM，与本次改动无关）；回归 `project-memory-signal-cleanup` 6/6、`memory-retry` 8/8、`project-memory-signals` 1/1、`memory-jobs` 11/11、`discussion-memory` 4/4，19 个记忆相关文件（含 `conversation-memory-*`、`memory-*`、`utterance-memory`、`task-memory`）除本机沙箱 EPERM 外全部通过（`laoweng-agent` 4、`conversation-memory-store` 1、`conversation-memory-runtime` 1 失败均为 `.local\agents` mkdir / spawn 被沙箱拒绝）。`tsc --noEmit`、prettier、`check-boundaries` / `check-overlays` / `check-field-resets` / `check-field-usage` 通过；`npm run test:unit` 因沙箱拒绝 spawn 未执行。线上库从本机不可达（RDS 公共地址 `PROTOCOL_CONNECTION_LOST`，生产只放行 ECS），本地 3307 开发库无该项目数据，因此本轮结论来自线上运行日志与代码，不是线上数据核对；发布后需确认：项目进程运行不再出现 `statusMarkdown` 校验失败、人工重试后排队行 `retry_count` 归零、只含任务条目的批次能正常落库、快照超限时运行仍为完成并出现「已重置维护会话」。

2026-11-04 已随第三次发布上线（提交 `dbfc54f`，包 `cothread-release-20261104T063024Z.tgz`，execution `exec-4afe972af70747aca0e7`，`current` 为 `/opt/cothread/releases/20261104T063140Z`）；线上健康、执行器就绪与新符号已核对，但记忆作业的实际运行效果仍需从运行历史确认——尤其那 2 条已被推到 30 天后的项目进程排队行，要人工点一次「重试」才会被调度。

## 项目进程信号改为扫描生成（2026-11-04 第五轮）

用户要求项目进程不要由业务事件直接写队列，改成像其它记忆作业那样先落进度/事实、再扫描进队列；并指出成员发言实际是「发消息写消息进度 → 扫描进度建窗口」，而不是逐条入队。核对代码后确认该判断成立：`queueConversationMessage` 只写线程级 `conversation_memory_queue`（first/last sequence）与 pending 消息索引，分析单元由 `createConversationWindow` 按序列扫描生成。项目进程此前的 5 处事件钩子则是在业务事务里直接写队列。

改动：

- 新增迁移 `221_project_memory_scan_state.sql`：每项目一行水位 `project_memory_scan_state.scan_cursor`（`cursor` 是 MySQL 保留字，列名用 `scan_cursor`）。
- 新增 `server/project-memory-scan.js`：按来源水位增量扫描 `project_change_logs`（动作白名单）、`iteration_context_changes`、`iteration_archive_workflows(status=completed)`、`agent_task_status_events`、`document_change_logs`（version_created / version_content_replaced / version_restored），复用 `isImportantTask` / `isImportantIteration` / `isTaskMilestoneTransition` 过滤后写队列；同一来源去重与失败次数重置沿用 `noteProjectMemorySignal`。
- 首次扫描只建水位（不回放历史）；新建项目在创建时写入空水位，让「项目初创」在首次扫描入队。
- `runMemoryMaintenance` 每轮挑一个到期项目扫描（30 秒节流），手动运行先扫指定项目再结算。
- 移除 5 处事件钩子：`service-projects.js`、`service-iterations.js`、`iteration-archive.js`、`task-pool-activity.js`、`documents/versions.js`；文档恢复改为写 `document_change_logs(version_restored)`，由扫描器展开为各版本信号。
- 面板「待处理的项目进程信号」收成计数按钮 + 只读列表弹窗（来源类型、提示、重试次数、最近/下次尝试、最近错误），不再内联铺开。

验证：新增 `tests/project-memory-scan.test.js` 4/4（新建项目首批事实首次扫描入队且建项目不写队列、项目变更/任务终态/迭代目标变更三条信号且二次扫描不重复、正式文件新版本与内容替换同一版本只留一行且版本号递增、主要任务与归档各一条）；受钩子移除影响的用例补扫描调用后通过：`project-memory` 7/7、`project-memory-signals` 1/1、`project-status` 7/7、`iteration-archive` 23/23、`document-memory` 15/15、`project-memory-signal-cleanup` 6/6；`conversation-memory-store` 14/14、`memory-jobs` 11/11、`memory-retry` 8/8、`integration` 22/22；`npm run lint`、`npx tsc --noEmit`、`npm run build` 通过。全量 `npm test` 结果见发布记录。

2026-11-04 已随第五次发布上线（提交 `15a1dab`，包 `cothread-release-20261104T082524Z.tgz`，execution `exec-891d4b8c21e742da8694`，`current` 为 `/opt/cothread/releases/20261104T082634Z`）：线上迁移 221 已应用，对本项目执行扫描返回 `initialized:true, inserted:0`（只建水位、不回放历史），cursor `taskEventId=197`、`milestone` 停在 2026-10-12。队列里那 2 条 10-25/10-26 的旧 `task` 信号核验失败原因已从 `too_big` 变为「缺少来源直接支持」，需要人工决定清理还是保留；自动重试到上限会停止。

已知取舍：扫描有最长约一个维护周期的延迟（手动运行会先扫再结算）；项目首次扫描不回放历史，历史存量仍由一次性回填处理；任务水位用自增 id，其余来源用 `(created_at,id)` 游标并以数据库原始时间字符串比较（连接 `dateStrings: true`，避免时区换算导致重复入队）。

## 项目进程减负：去文档、逐条核验、任务聚合、忽略入口（2026-11-04 第六轮）

用户提出四点：①项目进程不需要跟文档相关（已有文件索引和关联记忆）；②核验失败改为逐条丢弃；③task 信号不单独建条；④旧信号加「忽略」入口。重试策略确认为 5 级退避（1 分钟→5 分钟→30 分钟→2 小时→6 小时），之后停止自动重试。

改动：

- 去掉文档来源：`PROJECT_MEMORY_SIGNAL_KINDS` 收敛为 `milestone` / `iteration_context` / `archive` / `task`；扫描器删除 `document_change_logs` 分支；迁移 `222_drop_document_version_project_signals.sql` 清掉历史遗留行；`noteProjectMemorySignal` 忽略 `document_version`；`dropDocumentVersionSignals` / `dropUnavailableDocumentVersionSignals` 只作为历史遗留行的兼容清理保留。
- 逐条核验：核验调用改为返回 `{verdicts:[{index,supported,reason}]}`，`filterVerifiedEntries` 逐条丢掉不被来源直接支持的条目并记录到运行结果 `droppedEntries`，其余条目照常写入、候选照常消费，不再整批失败重试；兼容旧的 `{supported,reason}` 返回。
- 任务聚合：结算禁止生成发言/议题/文档类条目；`subject=task` 只允许引用多个任务来源的「任务分布」汇总条目，只引用一个任务来源的单任务条目丢弃；提示词同步改为「task 候选只汇总一条任务分布」。
- 忽略入口：新增 `POST /api/projects/:id/memory/signals/:queueId/ignore`，写权限校验、删除队列行并写 `project_memory_signal_ignored` 审计；信号弹窗每条加「忽略」按钮，忽略后不再自动重试。

验证：`tests/project-memory.test.js` 10/10（新增逐条丢弃、任务分布、忽略审计与 403/404）；`project-memory-scan` 4/4（文档变更不再入队）；`project-memory-signal-cleanup` 4/4（改为历史遗留行清理语义）；`memory-retry` 8/8、`document-memory` 15/15、`memory-jobs` 11/11、`iteration-archive` 23/23、`memory-read` 14/14、`project-status` 7/7、`project-memory-signals` 1/1、`integration` 22/22；`tsc`/`lint`/`build` 通过。全量与发布记录见 `05-cloud-environment.md` 文末。

## 尚需实际环境验收

自动化使用替身模型，不能证明观点判断、议题合并、文件识别和项目进程取舍质量。浏览器交互、真实模型材料抽样尚未完成。持续流量下的模型调用次数、公平调度、耗时，以及运行中项目封存等竞态仍需观察；不把它们写作已确认缺陷或已通过验收。
