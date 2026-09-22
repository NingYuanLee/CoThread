# EdgeOne Makers 部署

仓库包含 `edgeone.json`，构建命令为 `npm run build`，静态产物为 `dist`。普通 API 由 `cloud-functions/[[default]].js` 导出 Express 实例，平台负责监听，不执行常驻 `npm start`。

Makers 生成的 Node 入口会在请求处理器内重新执行应用模块（可在本地生成产物中看到 `mod_0` 的 IIFE）。因此普通 API 使用 `globalThis[Symbol.for("cothread.makers.http-app.v1")]` 保留整个 Express 实例，连同数据库连接池和耗时上下文一起在同一进程内复用；只缓存模块局部变量不能避免重复初始化。并发首次请求共享初始化 Promise，失败后允许重试。新进程仍会正常初始化和检查迁移，不跳过数据库版本校验。此缓存不存储请求用户、响应或会话数据。

部署后连续读取 `/api/health`，同一实例的后续请求应显示 `init;dur=0.0`，数据库查询次数由首次的迁移检查加健康检查降为一次健康检查。不同实例的首次请求仍可能出现初始化耗时。

## 配置与数据库

平台后端配置 `DATABASE_URL`，以及 `KNOWLEDGE_MODEL_*`、`COORDINATOR_MODEL_*`、`EXECUTOR_MODEL_*` 三套模型变量、`CREDENTIAL_ENCRYPTION_KEY` 和随机生成的 `MEMORY_MAINTENANCE_TOKEN`，按数据库要求设置 `DATABASE_SSL` 等连接选项。Makers 原生沙箱由请求上下文注入，不需要额外沙箱服务密钥。每套模型均包含请求地址、Key 和可附带推理强度的模型字段，使用 OpenAI Responses 兼容服务。`CREDENTIAL_ENCRYPTION_KEY` 沿用本地 `.env` 的原值，不能重新生成，否则旧账号令牌无法解密。真实 `.env`、`.local` 和 `.edgeone` 均不提交。已有账号沿用 MySQL，部署不会重置密码。

本地执行器由系统外部渠道分发。首次运行通过 Makers 网页登录授权，随后由本地执行器读取账号项目列表；本地仓库路径、项目开关、推送权限和开机启动设置不上传。Makers 只保存设备、授权、项目级连接权限和任务状态，不保存本地执行器安装包，也不提供版本发布、下载或自动更新能力。

后端首次启动会在数据库迁移锁保护下应用未执行的迁移。数据库账号需要相应建表权限，数据库网络也需允许平台访问。部署主域名默认接受 `http://cothread.z2l.top` 和 `https://cothread.z2l.top`；换域名或使用预览域名时，用 `APP_ORIGIN` 指定完整源地址。HTTPS 请求自动设置 Secure Cookie。

迁移和运行时资源兼容当前工作目录及 Agent bundle 旁的 `included_files` 布局。初始化失败时，API、Agent 和 MCP 返回固定的 `INIT_*` 错误代号，用于区分密钥配置、资源缺失、数据库连接或迁移失败；不返回原始 SQL、环境变量、路径和异常堆栈。

## Agent 与 MCP

- “插件管理”直接读取项目 DSH 注册表，按 L1/L2/L3 展示 `dsh-plugins`、`cothread-dsh-plugins` 和 `自定义skills`。原生插件、共序插件、Tool/MCP 和层级合同不入业务数据库；数据库初始化时没有 Skill 数据，只保存超级管理员后添加的纯提示词 Skill、版本和审计。Skill 不引用能力，不能上传执行代码、注册任意 MCP 地址或扩展层级能力上限。
- 小祥采用三级逻辑层：项目级一级小祥昵称“老翁”、名称“项目知识库管理员”；二级小祥是项目内同一调度角色（快速回应，重活交给三级，交活后再向群回报），各迭代只是该角色的独立会话，不按迭代拆成多名成员；三级小祥隶属于二级，每项任务一套执行会话（结束前必须向二级交活），不单独列项目成员。聊天中三个层级对用户统一显示为“小祥”，项目管理列出 L1/L2，监控页展示内部昵称、各迭代会话与职责。一级小祥按四类维护任务拆成独立 DSH 会话：成员发言、文档摘要、文档整理、迭代归档均按项目复用；关系库仍保存成员认识、文档摘要、项目长期总结、权限和任务状态等权威记录。
- 项目级记录包括成员认识、成员刷新游标和按不可变版本去重的文档摘要。二级上下文不复制其他迭代原文或文档正文；三级任务可通过项目目录、迭代 ID 和版本 ID 按需读取，并复用已有文档摘要。
- 成员发言、成员被 @ 和新文档版本只实时写入 MySQL 待整理队列，不同步调用一级小祥。`/cothread-memory` 是短时知识库维护入口，每次最多处理 25 个到期批次后退出；在 Makers 控制台配置每分钟定时调用，并携带 `Authorization: Bearer <MEMORY_MAINTENANCE_TOKEN>`。常驻 Node 部署使用同一处理器的 60 秒内置扫描。队列与处理游标保证实例回收、失败重试和跨迭代乱序完成时不丢更新。
- Makers Agents 的 `context.request` 包含普通请求头对象和已解析的 `body`，不是 Fetch `Request`。两个入口先统一转换为标准请求，再执行来源检查、鉴权和 MCP 传输；本地测试同时覆盖平台格式。
- `/cothread-agent` 为长任务入口，使用 `Makers-Conversation-Id` 传迭代 UUID。仍按账号令牌/登录 Cookie 和项目成员权限鉴权，不能凭迭代 ID 获得权限。
- 浏览器在出现排队任务时调用 Agent 入口，并持续读取原 API 中的进度；闲置实例回收后可从 MySQL 快照恢复。已中断的执行标记失败并供人工重试，避免自动重放有副作用的工具。
- `/cothread-mcp` 使用 Makers Agents 托管，调用方需携带账号 UUID 对应的 `Makers-Conversation-Id`。本机 Agent 连接器写入 MCP 配置时会自动带上该请求头。MCP 显式提及助手时，该请求负责执行对应迭代的排队任务，即使没有浏览器打开也可执行；调用端应允许足够的工具超时时间。
- MySQL 命名锁保证同一迭代不会被两个 Makers 实例同时执行；冷启动不会全局清空其他实例的任务。
- 恢复 DSH 检查点时，运行目录与 JSONL 存储目录统一迁移到当前实例；保留会话 ID 和历史事件，避免 Windows 路径在 Linux 云端被拒绝。数据库快照是恢复来源，不混入旧实例残留的重复日志。
- DSH 与会话编排位于 Agent 运行时；代码执行和文件操作通过 `context.sandbox` 使用 Makers 原生沙箱，不连接本地沙箱。业务文件和 DSH 会话快照仍保存在 MySQL。
- 普通 API 不打包 DSH；长任务超时配置为 1800 秒。应用不再用 10 分钟或 40 次工具调用截断 Agent 工作。

### 原生沙箱

Makers 按会话管理一个沙箱实例。最多七个并行执行任务在 `/home/user/cothread/<任务 ID>` 使用不同目录，属于目录隔离，不是七台物理隔离的机器；任一任务完成或停止都不会关闭其他任务的沙箱。实例由平台按 900 秒配置管理生命周期。

首次使用实例时尝试恢复 `/home/user/cothread` 的原生检查点；已存在的同一实例不反复覆盖恢复。请求内所有子任务结束后统一保存检查点，同一实例的保存串行执行。检查点受 Makers 25 MiB 配额和默认排除规则限制；需要长期交付的成果仍必须发布到项目文档库。

原生文件接口按文本使用，二进制文档先分块传输再在沙箱内解码；模型不会收到这些传输数据。工具桥接保留请求的原生沙箱上下文。若平台没有注入该上下文，工具明确报错，不回退到本地沙箱。小祥的普通接待、数据库读取和 DSH 上下文维护不依赖第三方沙箱配置。

聊天及文档上传采用鉴权分片：HTTP JSON 超过 512KB 走 `request-parts`；文件内容另有带 SHA-256 的分片会话（默认 6KiB/片），合并后单文件上限 20 MiB。未完成的上传片段在后续上传时清理超过 1 小时的记录。

## 验证

DSH 的 SDK 和执行插件包含运行时 peer dependencies，Makers 的外部依赖打包不会自动补齐它们。`edgeone.json` 显式包含 SDK protocol、Cordis group 和 attachment/sandbox/shell/fs/jobs/session-persistence 接口包。生成 Agent 包后运行 `node scripts/check-agent-package.mjs`，它只验证 DSH 初始化，不调用模型或数据库，并阻止从仓库的 `node_modules` 偷用漏打包的依赖。

Agent 启动器由 Makers 生成，目前引用 OpenTelemetry 1.x 的 `Resource` 等接口。仓库显式打包对应监控依赖，避免生产包启动时报缺少模块；不能直接单独升级至 2.x。该兼容版本存在上游安全公告，待 Makers 启动器支持新版后需要一起升级。依赖 Zod 4 自带的 `zod/v3` 保留业务校验行为，同时避免 DSH 重复安装多份 Zod 超过 Agent 250 MiB 包大小限制。

`/api/health` 应返回 JSON：`status: ok`，并包含 `agentEndpoint` 和 `mcpEndpoint`；未登录访问 `/api/me` 应返回 401 JSON，不能是前端 HTML。随后验证登录、项目列表、文件上传下载及 Agent 回复。

本地普通 `npm run dev` 拆成三个内部端口：浏览器仍打开 `PORT`（默认 3100）上的开发网关；API 与后台执行器在 `API_PORT`（默认 3101）；Vite/HMR 在 `VITE_PORT`（默认 3102）。网关把 `/api`、`/mcp` 转到 API，其余转到 Vite。再次启动会先停止占用这些端口的本项目旧进程。`DATABASE_URL` 指向 `127.0.0.1:3307` 时会拉起便携版 MySQL，API 启动时迁移数据库（与 Makers 冷启动相同）。Makers CLI 调试时会为前端追加 `--port` 参数，只启动 Vite；云函数及 Agent 由 CLI 单独托管。`edgeone makers link` 会同步平台环境变量到本地 `.env`，操作前注意保留本地配置。禁止本地常驻 worker 和 Makers 同时处理同一业务数据库，测试使用独立数据库。

本机 `npm run dev` / 监听 `127.0.0.1` 的 `npm start` 默认拒绝连接远端数据库。`edgeone makers link` 若把生产 `DATABASE_URL` 写入本地 `.env`，启动会失败而不是迁生产库。确需本机连接远端时设置 `COTHREAD_ALLOW_REMOTE_DB=1`，并确认没有其他执行器同时处理该库。云端常驻部署设置 `HOST=0.0.0.0` 后使用 `npm start` 可连接 RDS。只更新工作区文件不会更新已运行的 Node 进程，需要停止旧服务。

## 任务唤醒与轮询

- 消息、重试、压缩请求先事务提交，再发布进程内唤醒事件。本地执行器分为接待、上下文维护和最多七个执行任务的独立通道；没有工作时停止查询，每 60 秒补偿扫描一次。进程内事件不是持久队列，数据库任务记录负责恢复。
- Makers 页面在消息保存成功后立即调用已有 Agent 入口；打开已有待处理会话仍有补偿唤醒。唤醒请求去重，成功后 15 秒内抑制重复补偿，失败按 30、60、120 秒退避；新的消息不会绕过故障退避。执行命令不自动重放。
- 云端执行器只检查当前会话。有正在执行的任务时，空的接待、维护和认领查询最多约每 1.5 秒补查一次；同一进程的追加唤醒事件和任务完成会促使及时处理。所有通道都无任务时退出，不常驻扫描全库。
- 页面项目列表每 30 秒刷新，空闲会话逐步退至 30 秒，执行中的会话仍每 2.5 秒查进度，隐藏页面暂停；发送消息的即时唤醒不等待下一次页面刷新。

这些改动不是外部消息队列或 WebSocket 推送。跨进程的提交若没有活跃调用承载，仍依赖后续页面/MCP 调用恢复；需要无人打开页面也保证立即执行时，应接入具有持久投递和重试保证的队列。不能在短云函数返回后启动未经平台保障的后台 Promise 并称之为可靠投递。

官方 [Agents 运行模式](https://pages.edgeone.ai/document/agents) 确认同一会话的实例黏性和长请求支持，但当前 Handler 文档未给出 WebSocket Upgrade 接口，不能把通用 Node WebSocket 服务的能力直接等同于 Makers 的托管入口。

官方参考：[Node.js 云函数](https://pages.edgeone.ai/document/node-functions)、[Agents](https://pages.edgeone.ai/document/agents)、[Agents 配置](https://pages.edgeone.ai/document/agents-quick-start)。
