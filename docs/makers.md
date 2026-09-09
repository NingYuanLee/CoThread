# EdgeOne Makers 部署

仓库包含 `edgeone.json`，构建命令为 `npm run build`，静态产物为 `dist`。普通 API 由 `cloud-functions/[[default]].js` 导出 Express 实例，平台负责监听，不执行常驻 `npm start`。

## 配置与数据库

平台后端环境变量设置 `.env.example` 中的 6 项。`CREDENTIAL_ENCRYPTION_KEY` 沿用本地 `.env` 的原值，不能重新生成，否则旧账号令牌无法解密。真实 `.env`、`.local` 和 `.edgeone` 均不提交。已有账号沿用 MySQL，部署不会重置密码。

后端首次启动会在数据库迁移锁保护下应用未执行的迁移。数据库账号需要相应建表权限，数据库网络也需允许平台访问。部署主域名默认接受 `http://cothread.z2l.top` 和 `https://cothread.z2l.top`；换域名或使用预览域名时，用 `APP_ORIGIN` 指定完整源地址。HTTPS 请求自动设置 Secure Cookie。

## Agent 与 MCP

- `/cothread-agent` 为长任务入口，使用 `Makers-Conversation-Id` 传迭代 UUID。仍按账号令牌/登录 Cookie 和项目成员权限鉴权，不能凭迭代 ID 获得权限。
- 浏览器在出现排队任务时调用 Agent 入口，并持续读取原 API 中的进度；闲置实例回收后可从 MySQL 快照恢复。已中断的执行标记失败并供人工重试，避免自动重放有副作用的工具。
- `/cothread-mcp` 使用 Makers Agents 托管，调用方需携带账号 UUID 对应的 `Makers-Conversation-Id`。从界面重新复制 MCP 安装文档即可获得正确配置。MCP 显式提及助手时，该请求负责执行对应迭代的排队任务，即使没有浏览器打开也可执行；调用端应允许足够的工具超时时间。
- MySQL 命名锁保证同一迭代不会被两个 Makers 实例同时执行；冷启动不会全局清空其他实例的任务。
- DSH 与会话编排位于 Agent 运行时，工作目录使用临时目录；代码执行、文件操作仍使用原 ACS。业务文件和会话快照保存在 MySQL。
- 普通 API 不打包 DSH；长任务超时配置为 1800 秒，单轮模型执行仍保留应用原有的 10 分钟限制。

聊天及文档上传采用鉴权分片，避免 base64 编码后的请求超过云函数 6 MB 边界，继续执行原来的单文件 5 MiB 和业务权限校验。未完成的上传片段在后续上传时清理超过 1 小时的记录。

## 验证

Agent 启动器由 Makers 生成，目前引用 OpenTelemetry 1.x 的 `Resource` 等接口。仓库显式打包对应监控依赖，避免生产包启动时报缺少模块；不能直接单独升级至 2.x。该兼容版本存在上游安全公告，待 Makers 启动器支持新版后需要一起升级。依赖 Zod 4 自带的 `zod/v3` 保留业务校验行为，同时避免 DSH 重复安装多份 Zod 超过 Agent 250 MiB 包大小限制。

`/api/health` 应返回 JSON：`status: ok`，并包含 `agentEndpoint` 和 `mcpEndpoint`；未登录访问 `/api/me` 应返回 401 JSON，不能是前端 HTML。随后验证登录、项目列表、文件上传下载及 Agent 回复。

本地普通 `npm run dev` 仍运行原来的完整应用。Makers CLI 调试时会为前端追加 `--port` 参数，只启动 Vite；云函数及 Agent 由 CLI 单独托管。`edgeone makers link` 会同步平台环境变量到本地 `.env`，操作前注意保留本地配置。禁止本地常驻 worker 和 Makers 同时处理同一业务数据库，测试使用独立数据库。

官方参考：[Node.js 云函数](https://pages.edgeone.ai/document/node-functions)、[Agents](https://pages.edgeone.ai/document/agents)、[Agents 配置](https://pages.edgeone.ai/document/agents-quick-start)。
