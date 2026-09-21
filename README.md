# 共序 CoThread

让每次讨论都有承接，让每个决定都有出处。

共序是面向小团队的协作工作台。一次部署对应一家公司：服务独立、数据库隔离。成员在迭代群聊里讨论、引用精确文档版本、把任务交给内置助手「小祥」或本机 Agent。线上试用：[https://cothread.z2l.top](https://cothread.z2l.top)。

| 入口 | 定位 | 打开 |
|------|------|------|
| **关于我们** | 价值宣传与产品介绍 | 工作台登录页，或 `/about_us.html` |
| **本 README** | 克隆仓库后的快捷使用 | 本文件 |
| **Docs** | 概念、工作台、上传、MCP、连接器、部署细则 | 运行后打开 `/docs.html` |

工程师向的架构与 Makers 备忘：[`docs/architecture.md`](docs/architecture.md)、[`docs/makers.md`](docs/makers.md)。当前版本见工作台；首版面向小团队单实例试用。

## 本机启动

需要 Node.js 22.19+。本地 MySQL 为 Oracle 官方 MySQL 8.4.9 Windows ZIP 版，不注册系统服务，监听 `127.0.0.1:3307`。Agent 命令依赖 Git Bash。

首次：

```powershell
npm install
npm run setup
npm run dev
```

之后日常只需 `npm run dev`。它会在 `DATABASE_URL` 指向 `127.0.0.1:3307` 时拉起便携版 MySQL，执行未跑过的迁移、写入超级管理员（若尚未存在），再启动 API（默认 `3101`）、Vite（默认 `3102`）和 `3100` 上的开发网关（`/api`、`/mcp` 转到 API，其余转到 Vite）。再次执行会先停掉占用这些端口的本项目旧进程；也可用 `npm run dev:stop`。本机默认拒绝连接远端数据库；确需连接时设 `COTHREAD_ALLOW_REMOTE_DB=1`。

打开 <http://localhost:3100>。首次 `setup` 把初始账号写进 `.local/initial-admin.json` 和 `.local/登录信息.txt`。登录可用账号名或已绑定邮箱。

本机工作文件默认在 `.local/sandboxes`。命令以当前 Windows 账号执行，只应跑可信任务。`.env` 不入库；`npm run setup` 不覆盖已有 `.env`。部署差异见 [云端配置](docs/cloud-environment.md)。

```powershell
npm run mysql:stop
npm run dev:stop
npm run build
npm start
npm test                 # 必须独立 TEST_DATABASE_URL，禁止清日常库
npm run db:backup
npm run db:restore-check
npm run connector:build
```

也可用 `compose.yaml` 跑官方 `mysql:8.4.9`。不要同时让 Docker 与便携版占用 3307。

`npm test` 会清空目标库全部表后重新迁移，绝不能指向生产库或正在用的 `cothread` / `cothread_dev`。

## 接下来看 Docs

工作台怎么摆、文档三区、分片上传与 SHA-256、MCP 工具、连接器和服务器部署，都在 **`/docs.html`**（左侧目录、右侧说明）。不要在 README 里找长篇细则。

单文件上限 **20 MiB**（网页与 MCP 分片）。MCP 宿主约 10KB 参数截断时，大于 6144 字节的文件必须走 `start_file_upload` → `upload_file_chunk` → `complete_file_upload`。

## 项目结构

```text
web/                 React 工作台
public/              静态页（about_us.html、docs.html）
server/              HTTP API、权限、协作业务、MCP、沙箱路由
cloud-functions/     EdgeOne 云函数入口
agents/              Makers 长任务入口
migrations/          版本化 MySQL 结构
scripts/             安装初始化、迁移、连接器构建
tests/               真实数据库集成测试
docs/                架构与部署备忘（给工程师）
.local/              本机 MySQL、数据、私有配置（不入库）
```
