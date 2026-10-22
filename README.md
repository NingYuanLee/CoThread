# 共序 CoThread

让每次讨论都有承接，让每个决定都有出处。

共序是面向小团队的协作工作台。一次部署对应一家公司：服务独立、数据库隔离。成员在迭代群聊里讨论、引用精确文档版本与文件夹，把重活交给 Agent 成员「小祥」及其子 Agent（共用插件和 Skills）或本机 Agent。输入框可选对话模式（自由发言 / 有问必答只读 / 仅小程序 / CloudBase）。一轮结束时，迭代创建人或项目负责人确认归档方案，未完成事项可留在本轮或交给下一迭代。个人设置可进入管理空间。线上试用：[https://cothread.z2l.top](https://cothread.z2l.top)。

| 入口 | 定位 | 打开 |
|------|------|------|
| **关于我们** | 价值宣传与产品介绍 | 工作台登录页，或 `/about_us.html` |
| **本 README** | 克隆仓库后的快捷使用 | 本文件 |
| **使用手册** | 功能与运转规则：对话模式、文档版本、任务、小程序、归档、权限、本机助手 | 运行后打开 `/docs.html` |

文档分三处，见 [`docs/README.md`](docs/README.md)。工程说明在 [`docs/engineering/`](docs/engineering/)，由 Agent 维护，不要删除；相关改动要回写对应说明，并更新 [`docs/README.md`](docs/README.md) 的目录。产品资料在 [`docs/product/`](docs/product/)。当前版本见工作台；首版面向小团队单实例试用。生产部署在阿里云 ECS（见下方「部署」）。

项目内还有负责知识、成员认识与文档整理的 Agent 成员「老翁」。老翁和小祥按职责协作，Agent 不分等级。

## 本机启动

需要 Node.js 22.22.3+。本地 MySQL 为 Oracle 官方 MySQL 8.4.9 Windows ZIP 版，不注册系统服务，监听 `127.0.0.1:3307`。Agent 命令依赖 Git Bash。

首次：

```powershell
npm install
npm run setup
npm run dev
```

之后日常只需 `npm run dev`。它会在正式库指向 `127.0.0.1:3307`（`DATABASE_HOST_*` 或遗留 `DATABASE_URL`）时拉起便携版 MySQL，执行未跑过的迁移、写入超级管理员（若尚未存在），再启动 API（默认 `3101`）、Vite（默认 `3102`）和 `3100` 上的开发网关（`/api`、`/mcp` 转到 API，其余转到 Vite）。再次执行会先停掉占用这些端口的本项目旧进程；也可用 `npm run dev:stop`。默认监听 `0.0.0.0` 时可连 RDS；仅在强制 loopback 监听时才会拒绝远端库，确需覆盖时设 `COTHREAD_ALLOW_REMOTE_DB=1`。

打开 <http://localhost:3100>。首次 `setup` 把初始账号写进 `.local/initial-admin.json` 和 `.local/登录信息.txt`。登录可用用户名或已绑定邮箱。

本机工作文件默认在 `.local/sandboxes`。命令以当前 Windows 账号执行，只应跑可信任务。`.env` 不入库；`npm run setup` 不覆盖已有 `.env`。部署差异见 [云端配置](docs/engineering/05-cloud-environment.md)。

```powershell
npm run mysql:stop
npm run dev:stop
npm run build
npm start
npm test                 # 须独立测试库（TEST_DATABASE_HOST_* + TEST_DATABASE_AUTH），禁止清日常库
npm run db:backup
npm run db:restore-check
npm run windows-client:build
npm run setup:preview-browser   # Agent 视觉验收（HTML/文档预览截图）所需 Chromium
```

也可用 `compose.yaml` 跑官方 `mysql:8.4.9`。不要同时让 Docker 与便携版占用 3307。

便携版 MySQL 默认将二进制变更日志保留 24 小时，并在启动或日志轮转时自动清理过期日志，避免本地开发写入长期累积。已有安装会在下次启动时补齐缺失配置；自定义保留期可在 `.local/my.ini` 中设置 `binlog_expire_logs_seconds`。这只控制历史变更日志，不删除当前业务表数据；完整备份使用 `npm run db:backup`，需要复制或更长时间点恢复窗口时应相应延长保留期。Docker 与云端数据库的日志策略由各自配置管理。

`npm test` 会清空目标库全部表后重新迁移，绝不能指向生产库或正在用的 `cothread` / `cothread_dev`。

## 接下来看使用手册

功能全图和运转规则（对话模式、按需参与、文档版本、任务、小程序发布、归档、权限、本机助手）在 **`/docs.html`**（锚点 `#dialogue-mode`、`#archive`、`#admin`、`#account`、`#miniprogram`）。不要在 README 里找这些说明。安装和服务器发布仍以本文件和 `docs/engineering/` 为准。

单文件上限 **20 MiB**（网页与 MCP 分片）。MCP 宿主约 10KB 参数截断时，大于 6144 字节的文件必须走 `start_file_upload` → `upload_file_chunk` → `complete_file_upload`。

## 项目结构

```text
index.html           工作台壳，Vite 入口，不是文档
web/                 React 工作台
public/              原样发布的静态源：/about_us.html、/docs.html（使用手册）
dist/                npm run build 的产物，不要手改
server/              HTTP API、权限、协作业务、MCP、沙箱路由
dsh-layer/           共序加在官方 DSH 上的定制层，不是 Agent 本身
migrations/          版本化 MySQL 结构
scripts/             安装初始化、迁移、ECS 发布、本地执行器构建
tests/               真实数据库集成测试
docs/                文档总目录。engineering/ 是工程说明，product/ 是产品资料。使用手册是 public/docs.html
.local/              本机 MySQL、沙箱和密钥。删除等于丢数据，不入库
.code_deploy/        发版产物，不是配置。可整目录删除后重新打包，不要手改清单
```

## 部署

生产环境为阿里云 ECS 单实例 + RDS：`npm run build && node scripts/ecs-pack.mjs` 打包，再用 `scripts/ecs-promote.sh` 解压到 `releases/<id>`、探活后原子切换 `current` 并 `systemctl restart cothread`。变量清单见 [云端配置](docs/engineering/05-cloud-environment.md)。
