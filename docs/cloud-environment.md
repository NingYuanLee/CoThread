# 云端环境变量

应用后端需要支持常驻 Node.js 进程（Node.js 22.19+，推荐 24）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；部署平台是否支持这些能力需按所选产品确认。

在平台中将变量配置到后端运行环境。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，平台已经设置的同名环境变量优先。

| 变量 | 配置 |
| --- | --- |
| `DATABASE_URL` | 云端可连接的 MySQL URL；密码中的特殊字符需 URL 编码 |
| `E2B_API_KEY`、`E2B_DOMAIN`、`E2B_API_URL` | ACS 服务配置 |
| `DEEPSEEK_API_KEY` | 模型服务密钥 |
| `HOST` | `0.0.0.0` |
| `PORT` | 使用平台要求的监听端口；未设置时为 `3100` |
| `APP_ORIGIN` | 用户实际访问的 HTTPS 域名，包含 `https://`，不带末尾斜杠 |
| `COOKIE_SECURE` | HTTPS 部署设置为 `true` |
| `CREDENTIAL_ENCRYPTION_KEY` | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致 |
| `DATABASE_SSL` | 数据库启用 TLS 时设置为 `true` |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD` | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME` |

迁移已有部署时，保留原有令牌加密密钥（原环境变量或 `.local/credential-encryption.key` 的内容），否则无法解密原来的账号令牌。空库首次部署才生成新密钥；不要提交密钥。

构建命令：`npm ci && npm run build`。发布前运行 `npm run db:migrate`；空库首次部署额外运行 `npm run db:seed`。启动命令：`npm start`。当前版本运行单个应用实例。

Agent 的沙箱镜像、DSH 安装等配置见 `architecture.md` 和 `.env.example`，应按实际 ACS 模板设置。
