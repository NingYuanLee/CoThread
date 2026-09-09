# EdgeOne Makers 部署

仓库包含 `edgeone.json`，构建命令为 `npm run build`，静态产物为 `dist`。普通 API 由 `cloud-functions/[[default]].js` 导出 Express 实例，平台负责监听，不执行常驻 `npm start`。

Makers 生成的 Node 入口会在请求处理器内重新执行应用模块（可在本地生成产物中看到 `mod_0` 的 IIFE）。因此普通 API 使用 `globalThis[Symbol.for("cothread.makers.http-app.v1")]` 保留整个 Express 实例，连同数据库连接池和耗时上下文一起在同一进程内复用；只缓存模块局部变量不能避免重复初始化。并发首次请求共享初始化 Promise，失败后允许重试。新进程仍会正常初始化和检查迁移，不跳过数据库版本校验。此缓存不存储请求用户、响应或会话数据。

部署后连续读取 `/api/health`，同一实例的后续请求应显示 `init;dur=0.0`，数据库查询次数由首次的迁移检查加健康检查降为一次健康检查。不同实例的首次请求仍可能出现初始化耗时。

## 配置与数据库

平台后端配置 `DATABASE_URL`、`DEEPSEEK_API_KEY` 和 `CREDENTIAL_ENCRYPTION_KEY`，按数据库要求设置 `DATABASE_SSL` 等连接选项；使用 Makers 原生沙箱不再需要 `E2B_API_KEY`、`E2B_DOMAIN` 和 `E2B_API_URL`。`CREDENTIAL_ENCRYPTION_KEY` 沿用本地 `.env` 的原值，不能重新生成，否则旧账号令牌无法解密。真实 `.env`、`.local` 和 `.edgeone` 均不提交。已有账号沿用 MySQL，部署不会重置密码。

后端首次启动会在数据库迁移锁保护下应用未执行的迁移。数据库账号需要相应建表权限，数据库网络也需允许平台访问。部署主域名默认接受 `http://cothread.z2l.top` 和 `https://cothread.z2l.top`；换域名或使用预览域名时，用 `APP_ORIGIN` 指定完整源地址。HTTPS 请求自动设置 Secure Cookie。

迁移和运行时资源兼容当前工作目录及 Agent bundle 旁的 `included_files` 布局。初始化失败时，API、Agent 和 MCP 返回固定的 `INIT_*` 错误代号，用于区分密钥配置、资源缺失、数据库连接或迁移失败；不返回原始 SQL、环境变量、路径和异常堆栈。

## Agent 与 MCP

- Makers Agents 的 `context.request` 包含普通请求头对象和已解析的 `body`，不是 Fetch `Request`。两个入口先统一转换为标准请求，再执行来源检查、鉴权和 MCP 传输；本地测试同时覆盖平台格式。
- `/cothread-agent` 为长任务入口，使用 `Makers-Conversation-Id` 传迭代 UUID。仍按账号令牌/登录 Cookie 和项目成员权限鉴权，不能凭迭代 ID 获得权限。
- 浏览器在出现排队任务时调用 Agent 入口，并持续读取原 API 中的进度；闲置实例回收后可从 MySQL 快照恢复。已中断的执行标记失败并供人工重试，避免自动重放有副作用的工具。
- `/cothread-mcp` 使用 Makers Agents 托管，调用方需携带账号 UUID 对应的 `Makers-Conversation-Id`。从界面重新复制 MCP 安装文档即可获得正确配置。MCP 显式提及助手时，该请求负责执行对应迭代的排队任务，即使没有浏览器打开也可执行；调用端应允许足够的工具超时时间。
- MySQL 命名锁保证同一迭代不会被两个 Makers 实例同时执行；冷启动不会全局清空其他实例的任务。
- DSH 与会话编排位于 Agent 运行时；代码执行和文件操作通过 `context.sandbox` 使用 Makers 原生沙箱，不读取旧 ACS 配置或连接旧沙箱 ID。业务文件和 DSH 会话快照仍保存在 MySQL。
- 普通 API 不打包 DSH；长任务超时配置为 1800 秒，单轮模型执行仍保留应用原有的 10 分钟限制。

### 原生沙箱

Makers 按会话管理一个沙箱实例。三个临时子 Agent 在 `/home/user/cothread/<任务 ID>` 使用不同目录，属于目录隔离，不是三台物理隔离的机器；任一子任务完成或停止都不会关闭其他任务的沙箱。实例由平台按 900 秒配置管理生命周期。

首次使用实例时尝试恢复 `/home/user/cothread` 的原生检查点；已存在的同一实例不反复覆盖恢复。请求内所有子任务结束后统一保存检查点，同一实例的保存串行执行。检查点受 Makers 25 MiB 配额和默认排除规则限制；需要长期交付的成果仍必须发布到项目文档库。

原生文件接口按文本使用，二进制文档先分块传输再在沙箱内解码；模型不会收到这些传输数据。工具桥接保留请求的原生沙箱上下文。若平台没有注入该上下文，工具明确报错，不回退连接已删除的 ACS。主助手普通接待、数据库读取和 DSH 上下文维护不因缺少 ACS 配置而被禁用。

聊天及文档上传采用鉴权分片，避免 base64 编码后的请求超过云函数 6 MB 边界，继续执行原来的单文件 5 MiB 和业务权限校验。未完成的上传片段在后续上传时清理超过 1 小时的记录。

## 验证

Agent 启动器由 Makers 生成，目前引用 OpenTelemetry 1.x 的 `Resource` 等接口。仓库显式打包对应监控依赖，避免生产包启动时报缺少模块；不能直接单独升级至 2.x。该兼容版本存在上游安全公告，待 Makers 启动器支持新版后需要一起升级。依赖 Zod 4 自带的 `zod/v3` 保留业务校验行为，同时避免 DSH 重复安装多份 Zod 超过 Agent 250 MiB 包大小限制。

`/api/health` 应返回 JSON：`status: ok`，并包含 `agentEndpoint` 和 `mcpEndpoint`；未登录访问 `/api/me` 应返回 401 JSON，不能是前端 HTML。随后验证登录、项目列表、文件上传下载及 Agent 回复。

本地普通 `npm run dev` 仍运行原来的完整应用。Makers CLI 调试时会为前端追加 `--port` 参数，只启动 Vite；云函数及 Agent 由 CLI 单独托管。`edgeone makers link` 会同步平台环境变量到本地 `.env`，操作前注意保留本地配置。禁止本地常驻 worker 和 Makers 同时处理同一业务数据库，测试使用独立数据库。

本地完整应用默认拒绝连接远端数据库启动后台执行器，防止旧进程抢占云端队列。只有明确停用云端执行器、改由本地单独承接任务时，才设置 `ALLOW_REMOTE_WORKER=true`。只更新工作区文件不会更新已运行的 Node 进程，需要停止旧服务。

## 任务唤醒与轮询

- 消息、重试、压缩请求先事务提交，再发布进程内唤醒事件。本地执行器分为接待、上下文维护和最多三个执行任务的独立通道；没有工作时停止查询，每 60 秒补偿扫描一次。进程内事件不是持久队列，数据库任务记录负责恢复。
- Makers 页面在消息保存成功后立即调用已有 Agent 入口；打开已有待处理会话仍有补偿唤醒。唤醒请求去重，成功后 15 秒内抑制重复补偿，失败按 30、60、120 秒退避；新的消息不会绕过故障退避。执行命令不自动重放。
- 云端执行器只检查当前会话。有正在执行的任务时，空的接待、维护和认领查询最多约每 1.5 秒补查一次；同一进程的追加唤醒事件和任务完成会促使及时处理。所有通道都无任务时退出，不常驻扫描全库。
- 页面项目列表每 30 秒刷新，空闲会话逐步退至 30 秒，执行中的会话仍每 2.5 秒查进度，隐藏页面暂停；发送消息的即时唤醒不等待下一次页面刷新。

这些改动不是外部消息队列或 WebSocket 推送。跨进程的提交若没有活跃调用承载，仍依赖后续页面/MCP 调用恢复；需要无人打开页面也保证立即执行时，应接入具有持久投递和重试保证的队列。不能在短云函数返回后启动未经平台保障的后台 Promise 并称之为可靠投递。

官方 [Agents 运行模式](https://pages.edgeone.ai/document/agents) 确认同一会话的实例黏性和长请求支持，但当前 Handler 文档未给出 WebSocket Upgrade 接口，不能把通用 Node WebSocket 服务的能力直接等同于 Makers 的托管入口。

官方参考：[Node.js 云函数](https://pages.edgeone.ai/document/node-functions)、[Agents](https://pages.edgeone.ai/document/agents)、[Agents 配置](https://pages.edgeone.ai/document/agents-quick-start)。
