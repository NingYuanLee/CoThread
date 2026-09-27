# 云端环境变量

应用后端需要支持常驻 Node.js 进程（Node.js 22.19+，推荐 24）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；部署平台是否支持这些能力需按所选产品确认。

在平台中将变量配置到后端运行环境。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，平台已经设置的同名环境变量优先。

| 变量 | 配置 |
| --- | --- |
| `DATABASE_HOST_INTERNAL` / `DATABASE_HOST_PUBLIC` | 正式库内网 / 外网地址，格式 `host:port/dbname`；运行时自动选：阿里云 ECS 用内网，本机用外网 |
| `DATABASE_ENDPOINT` | 可选强制 `public` 或 `internal`；不设则按主机类型自动判断 |
| `DATABASE_AUTH` | 正式库账号密码，合写为 `user:password`（仅按第一个冒号拆分） |
| `TEST_DATABASE_HOST_INTERNAL` / `TEST_DATABASE_HOST_PUBLIC` | 测试库内网 / 外网地址，格式 `host:port/dbname` |
| `TEST_DATABASE_AUTH` | 测试库 `user:password`；`npm test` 会整库清表，勿指向正式库名 |
| Makers 原生沙箱 | 由 EdgeOne Makers 请求上下文注入，无需额外沙箱密钥 |
| `KNOWLEDGE_MODEL_BASE_URL` | 一级知识库模型的 OpenAI Responses 兼容接口根地址 |
| `KNOWLEDGE_MODEL_API_KEY` | 一级知识库模型的 API 密钥，属于敏感信息 |
| `KNOWLEDGE_MODEL` | 一级知识库模型，格式为 `模型名` 或 `模型名@推理强度` |
| `COORDINATOR_MODEL_BASE_URL` | 二级任务调度模型的 OpenAI Responses 兼容接口根地址 |
| `COORDINATOR_MODEL_API_KEY` | 二级任务调度模型的 API 密钥，属于敏感信息 |
| `COORDINATOR_MODEL` | 二级任务调度模型，格式为 `模型名` 或 `模型名@推理强度` |
| `EXECUTOR_MODEL_BASE_URL` | 三级任务执行模型的 OpenAI Responses 兼容接口根地址 |
| `EXECUTOR_MODEL_API_KEY` | 三级任务执行模型的 API 密钥，属于敏感信息 |
| `EXECUTOR_MODEL` | 三级任务执行模型，格式为 `模型名` 或 `模型名@推理强度` |
| `CREDENTIAL_ENCRYPTION_KEY` | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致 |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD` | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME` |
| `SMTP_URL` | SMTP 连接地址，例如 `smtps://账号:授权码@服务器:465`；账号和授权码中的特殊字符需 URL 编码 |
| `EMAIL_FROM` | 系统邮件显示的发件人名称和地址 |
| `MEMORY_MAINTENANCE_TOKEN` | 定时维护专用令牌（`POST /api/memory-maintenance` 与 `/cothread-memory`），属于敏感信息 |

`CREDENTIAL_ENCRYPTION_KEY` 与 `MEMORY_MAINTENANCE_TOKEN` 须人工配置并长期固定；`npm run setup` 不会生成它们。迁移已有部署时保留原有令牌加密密钥（环境变量，或将已有 `.local/credential-encryption.key` 的 32 字节二进制内容编码为 base64），否则无法解密原来的账号令牌。不要提交密钥；也不要在运行时自动新建密钥文件。

构建命令：`npm ci && npm run build`。常驻 `npm start` 与本地 `npm run dev` 启动时会应用未执行的迁移并尝试写入超级管理员（需 `.local/initial-admin.json` 或 `ADMIN_EMAIL`/`ADMIN_PASSWORD`）。也可单独运行 `npm run db:migrate`。当前版本运行单个应用实例。

## ECS 发布（失败不替换正式版）

与 EdgeOne/Makers 类似：新版本解压到 `/opt/cothread/releases/<id>`，在临时端口探活 `/api/health`；**通过后**才把 `/opt/cothread/current` 原子切到新目录并 `systemctl restart cothread`。探活失败则删除本轮 release，`current` 与线上进程不动。共享 `.env`、`.local` 在 `/opt/cothread/`，不随 release 覆盖。

本地：`npm run build && node scripts/ecs-pack.mjs` → 把 tgz 与 `scripts/ecs-promote.sh` 放到机器后执行 `RELEASE_TGZ=... bash scripts/ecs-promote.sh`。

本地 `.env` 仅保留 `.env.example` 中列出的必要项。监听 `0.0.0.0:3100`、站点 `https://cothread.z2l.top`、HTTPS 时 Secure Cookie 已在代码写死，不必再配。

本地任务使用 `.local/sandboxes`，Makers 任务使用平台原生沙箱；总结模式默认为 `direct`。三套模型配置分别服务知识库整理、会话调度和 DSH 执行。每套包含 `BASE_URL`、`API_KEY` 和模型字段；模型字段可写成 `模型名@推理强度`，省略推理强度时默认使用 `medium`。推理强度可取 `off`、`none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra`。`DSH_ENABLED` 和 `DSH_BOOTSTRAP` 默认启用，可显式设为 `false`：前者控制 DSH 总结能力，后者控制沙箱内自动安装运行环境。预装 DSH 的环境可关闭自动安装，详见 `architecture.md`。

模型调用统一使用 OpenAI Responses API。各套 `*_MODEL_BASE_URL` 是服务商提供的 API 基础地址，程序不会擅自补 `/v1`；Responses 适配器只在该地址后追加 `/responses`。本地服务的命令以应用进程的操作系统账号在 `.local/sandboxes` 中执行，不具备容器级隔离；云端 Makers 请求只使用平台注入的原生沙箱。

本地首次账号由 `npm run setup` 生成至 `.local/initial-admin.json`，不进入版本库；`npm run db:seed` 读取它完成数据库账号初始化。云端空库可临时设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 完成初始化，已有账号只依赖数据库。
