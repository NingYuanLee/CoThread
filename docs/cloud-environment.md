# 云端环境变量

应用后端需要支持常驻 Node.js 进程（Node.js 22.19+，推荐 24）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；部署平台是否支持这些能力需按所选产品确认。

在平台中将变量配置到后端运行环境。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，平台已经设置的同名环境变量优先。

| 变量 | 配置 |
| --- | --- |
| `DATABASE_URL` | 云端可连接的 MySQL URL；密码中的特殊字符需 URL 编码 |
| `E2B_API_KEY`、`E2B_DOMAIN`、`E2B_API_URL` | ACS 服务配置 |
| `KNOWLEDGE_MODEL_*` | 一级项目知识库管理员的五项模型配置 |
| `COORDINATOR_MODEL_*` | 二级任务调度员的五项模型配置 |
| `EXECUTOR_MODEL_*` | 三级任务执行者的五项模型配置 |
| `HOST` | `0.0.0.0` |
| `PORT` | 使用平台要求的监听端口；未设置时为 `3100` |
| `APP_ORIGIN` | 用户实际访问的 HTTPS 域名，包含 `https://`，不带末尾斜杠 |
| `COOKIE_SECURE` | HTTPS 部署设置为 `true` |
| `CREDENTIAL_ENCRYPTION_KEY` | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致 |
| `DATABASE_SSL` | 数据库启用 TLS 时设置为 `true` |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD` | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME` |

迁移已有部署时，保留原有令牌加密密钥（原环境变量值，或将 `.local/credential-encryption.key` 的 32 字节二进制内容编码为 base64），否则无法解密原来的账号令牌。空库首次部署才生成新密钥；不要提交密钥。

构建命令：`npm ci && npm run build`。发布前运行 `npm run db:migrate`；空库首次部署额外运行 `npm run db:seed`。启动命令：`npm start`。当前版本运行单个应用实例。

本地 `.env` 仅保留 `.env.example` 中列出的必要项。其余参数无需重复填写默认值：监听 `127.0.0.1:3100`，站点地址 `http://localhost:3100`，Cookie Secure 和数据库 TLS 默认关闭；云端 HTTPS、监听地址和数据库 TLS 按上表覆盖。

ACS 默认模板为 `code-interpreter`，任务超时为 300000 毫秒；总结模式为 `direct`。三套模型配置分别服务知识库整理、会话调度和 DSH 执行。每套包含 `PROVIDER`、`BASE_URL`、`API_KEY`、`NAME`、`REASONING_EFFORT`，推理强度可取 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`，默认 `medium`。`DSH_ENABLED` 和 `DSH_BOOTSTRAP` 默认启用，可显式设为 `false`：前者控制旧版 DSH 总结能力，后者控制 DSH 执行时自动安装运行环境。预装 DSH 的模板可关闭自动安装，详见 `architecture.md`。

模型调用统一使用 OpenAI Responses API。各套 `*_MODEL_BASE_URL` 是服务商提供的 API 基础地址，程序不会擅自补 `/v1`；Responses 适配器只在该地址后追加 `/responses`。`LOCAL_SANDBOX_ENABLED` 仅用于本地开发，不应在云端服务启用。开启后命令以应用进程的操作系统账号执行，不具备容器级隔离。

本地首次账号由 `npm run setup` 生成至 `.local/initial-admin.json`，不进入版本库；`npm run db:seed` 读取它完成数据库账号初始化。云端空库可临时设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 完成初始化，已有账号只依赖数据库。
