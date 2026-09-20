# 共序 CoThread

让每次讨论都有承接，让每个决定都有出处。

共序是面向小团队的协作工作台。一次部署对应一家公司：服务独立部署、数据库隔离。公司之内是项目管理，项目之内是迭代管理，迭代之内是任务管理。成员在迭代群聊里讨论、引用精确文档版本、把任务交给内置助手「小祥」或成员本机的 Agent（Cursor / Codex / Claude Code）；成果进入不可覆盖的文档版本，人工审核后归档。线上试用：[https://cothread.z2l.top](https://cothread.z2l.top)。

本地服务使用 `.local/sandboxes`，EdgeOne Makers 部署使用平台原生沙箱。MySQL 保存业务数据、附件字节与 Agent 会话快照。当前版本 `0.1.11`。

## 项目与角色架构

协作层级（一家公司、一套库）：

| 层级 | 含义 |
|------|------|
| 公司 | 单次独立部署。账号、项目、文件都在本实例的 MySQL 里，与其他部署互不影响 |
| 项目 | 长期工作空间：共享文档库、长期记忆、项目成员 |
| 迭代 | 一次讨论群聊：消息、本轮 L2；文档仍用项目文档库 |
| 任务 | 迭代内可指派、确认、执行的工作项：L3 槽位或人类 / 连接器执行 |

角色层级（Agent 不是公司目录里的人）：

| 层级 | 谁在这里 |
|------|----------|
| 成员管理 | 仅人类成员，含超级管理员。系统管理里的「成员管理」对应这一层 |
| 项目成员 | 本项目人类成员、这些成员绑定到本项目的连接器、本项目级 Agent（L1，对用户仍叫小祥） |
| 迭代成员 | 本项目人类成员、本迭代级 Agent（L2 调度）、任务级子 Agent（L3 执行槽） |

聊天里 @ 的始终是「小祥」。L1 / L2 / L3 是同一对外身份的内部职责，分别挂在项目、迭代、任务上，不会写入 `users` 表。

## 工作台长什么样

打开项目后是三栏布局：

- **左侧**：可收缩。列出当前项目的迭代；底部打开「项目管理」（基础信息、人类成员、连接器、项目级 Agent）和「小祥 Agent 监控」（L1 / L2 / L3）。
- **中间**：迭代群聊。默认勾选「交给 Agent 处理」；可引用文档版本、上传附件（进入当天对话缓存目录）、梳理讨论、停止或重试执行。
- **右侧**：**文档浏览器**，不是成员面板。一棵树浏览**本项目共享**的正式文件、对话缓存与沙箱产物；可选中预览 Markdown / 文本代码 / 图片 / PDF / Word / Excel / PowerPoint。所有迭代看到同一套项目文档库。

人工不能在对话缓存或沙箱产物目录里直接新建、移动或改内容；可查看、引用、下载、审核、重命名、软删除。点「需要修改」会弹出说明框，确认后发到当前迭代群聊：沙箱产物 @小祥；对话缓存若不是本人上传则 @来源人，本人上传的对话缓存则 @小祥。小祥按对话缓存意见改出的文件保存到沙箱产物，不覆盖对话缓存原件。正式文件区可由负责人整理文件夹、上传与另存。

## 本机启动

需要 Node.js 22.19+。本地 MySQL 为 Oracle 官方 MySQL 8.4.9 Windows ZIP 版，不注册系统服务，监听 `127.0.0.1:3307`。Agent 命令依赖 Git Bash。

首次：

```powershell
npm install
npm run setup
npm run dev
```

之后日常只需 `npm run dev`。它会在 `DATABASE_URL` 指向 `127.0.0.1:3307` 时拉起便携版 MySQL，应用未执行的迁移、写入超级管理员（若尚未存在），再启动 API（默认 `3101`）、Vite（默认 `3102`）和 `3100` 上的开发网关（把 `/api`、`/mcp` 转到 API，其余转到 Vite）。再次执行会先停止占用这些端口的本项目旧进程再拉起；也可用 `npm run dev:stop`。本机进程默认拒绝连接 RDS 等远端库，避免与线上执行器抢任务；确需连接时设置 `COTHREAD_ALLOW_REMOTE_DB=1`。

打开 <http://localhost:3100>。首次 `npm run setup` 把初始账号写进 `.local/initial-admin.json` 和 `.local/登录信息.txt`，之后不再改这两个文件，启动时也不会改库里已有超级管理员的密码。可在账号设置中自行改密。

登录可用账号名或已绑定邮箱。邮箱注册与「重置密码」走验证码（10 分钟有效）；公开入口可启用人机验证。工作空间设置里可绑定邮箱。

本机运行时，工作文件默认位于 `.local/sandboxes`。命令由本机 Git Bash 执行，进程不继承数据库或服务密钥；仍能访问当前 Windows 账号可访问的系统资源，因此只应运行可信任务。容器级隔离需要另行安装 Docker、WSL 沙箱或其他隔离运行时。

本地 `.env` 保留数据库、模型和执行后端配置及 `CREDENTIAL_ENCRYPTION_KEY`。普通参数使用代码默认值；部署差异仍可通过环境变量覆盖，详见 [云端配置](docs/cloud-environment.md)。

`npm run setup` 不覆盖已有 `.env`。模型与 MySQL 配置分别设置，不要提交 `.env` 或 `.local`。

```powershell
npm run mysql:stop   # 优雅关闭本地数据库
npm run dev:stop     # 停止本项目开发用的 Vite 与 API；MySQL 保持运行
npm run build        # 类型检查及前端生产构建
npm start            # 使用构建后的静态页面
npm test             # 真实 MySQL 集成测试；必须配置独立 TEST_DATABASE_URL，禁止清库 cothread_dev
npm run app:start    # Windows：后台启动生产版；仅连接本地 3307 时启动本地 MySQL
npm run app:stop     # Windows：停止本项目的后台应用
npm run db:backup    # 完整备份业务数据与文件内容
npm run db:restore-check # Windows 本地：导入独立测试库，校验后删除测试库
```

也提供 `compose.yaml`，安装 Docker 的机器可用官方 `mysql:8.4.9` 镜像。先设置 `MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`，并让 `DATABASE_URL` 中的用户密码与前者相同。不要同时启动 Docker 和便携版 MySQL 占用 3307。

## 已实现

### 账号、项目、迭代与任务

- 登录、公司级人类成员目录与项目成员分离；同一账号可加入多个项目，各项目分别分配负责人／成员／只读。超级管理员可在系统管理里维护项目与人类成员；新建账号不会自动获得任何项目权限，也不会把 Agent 写进公司目录。
- 项目管理弹窗维护本项目人类成员；项目级 Agent（L1）固定出现、不可移出。成员本人的 Windows 连接器授权后可绑定本项目，作为该人类成员的执行通道，而不是独立账号。
- 邮箱注册、绑定邮箱、验证码重置密码。
- 项目与迭代群聊，消息按数据库序号排序；页面先加载最近 50 条，向上滚动加载更早记录，隐藏页暂停轮询。
- 迭代内任务池：辅助任务（L2 Ask）、沙箱正式任务、人类任务（本人执行或下发连接器，创建时可引用正式文件版本）。状态含待指派、待确认、待开始、执行中、等待中、阻塞暂停，以及已拒绝 / 已放弃 / 已完成 / 已取消 / 已失败。任务状态变更和本机连接器汇报进度会 @任务来源人。

### 文档与归档

- 文档绑定在项目下，**全部迭代共享同一套项目文档库**，分三个区：
  - **对话缓存**：来自对话框上传或 MCP `upload_cache_draft`；需要发送消息时再用 `post_message.refs` 引用，按 Asia/Shanghai 自然日进日期文件夹。内容不可由人在库里直接改，Agent 也不能往这里新增。
  - **沙箱产物**：主要由云端 Agent 在沙箱中生成、编辑并发布；人工不能当附件丢进这一区。
  - **正式文件**：已确认的缓存/产物可另存至此，或人类在正式文件区手动上传。正式文件不分版本叠加。
- 文档二进制入库，单文件 5 MiB、SHA-256、不可覆盖版本。上传和 Agent 发布都不等于审批通过；本地 AI 令牌不能审批或归档。
- 消息可引用本项目文档库中的有效版本。点「需要修改」须填写意见并发到当前迭代；产物 @小祥，缓存非本人 @来源人，缓存本人 @小祥。
- 归档事务保存结论、消息、审核、版本摘要和执行结果。已确认的产物最新版会另存到正式文件（名称带版本号，不含缓存）。归档后本迭代不可改，文档库仍留给后续迭代使用。
- 删除为可恢复软删除；头像上传前缩至 256 像素。Markdown 预览不渲染原始 HTML、不加载外部图。

### 小祥（对用户是一个身份）

聊天里始终显示为「小祥」。内部三级，分别挂在项目 / 迭代 / 任务上：

| 层级 | 对内称呼 | 挂载 | 职责 |
|------|----------|------|------|
| 一级 L1 | 老翁 · 项目知识库管理员 | 项目成员 | 成员认识、文档摘要、正式文件整理、迭代归档总结与长期记忆 |
| 二级 L2 | 任务调度员 | 迭代成员 | 每个迭代一套上下文：快速回应，重活派三级，交活后再向群回报 |
| 三级 L3 | 任务执行者 | 迭代成员（任务槽） | 每项工作独立执行；结束前必须向二级交活，成败都回报 |

- 一级四类维护任务各有独立上下文，按项目复用；成员发言与文档变更先入待整理队列，由维护入口定期处理（Makers 用 `/cothread-memory` 定时；本机约 60 秒扫描）。
- 单个迭代最多同时 7 个三级执行任务，加上二级接待共 8 个工作名额。第 8 个新执行到来时说明太忙、只陪聊，不静默排队。同一成员再 @ 补充要求时更新已有任务（DSH steering），不另开任务。
- 监控页可看一级四类、二级迭代用量；三级在任务卡片「聊天」里看原生会话并追加要求。任务可由成员随时停止，不再按墙钟或工具次数截断。
- 多人项目未明确 @ 时，二级可选择沉默；仅成员与助手两人时默认回复。成员本地 AI 提交不会触发回复循环。
- 「梳理讨论」在输入框预填基于已有上下文的请求，不弹消息条数选择框。

### 执行环境与进度

- 内置 DSH Agent：读项目资料、在沙箱里改文件、跑命令与测试、把成果存成文档版本。云端走 Makers 原生沙箱（会话级实例，目录隔离，检查点有配额）；长期成果必须发布到文档库。
- 聊天显示执行进度、工具输入与结果，支持停止、失败重试。服务重启后运行中任务标中断，避免自动重放有副作用的操作。
- 会话快照、工具过程入 MySQL。二级上下文增量纳入成员发言，约 900K token 自动压缩。

### 共序 MCP

账号单令牌、30 天有效；哈希鉴权，明文用 AES-256-GCM 保存。当前 Streamable HTTP MCP 工具由共享能力清单统一注册，调用者身份由服务端凭据确定。令牌由本机 Agent 连接器在授权后自动申领并写入 Cursor / Codex / Claude Code 的 MCP 配置，网页不再提供手动配置入口。详见下文。

### 本机 Agent 连接器

Windows 单文件程序（`npm run connector:build`），由系统外部渠道分发，网页不提供安装包。授权后按项目绑定本地 Git 根目录；「交给本机 Agent」在有在线连接器的项目上可用。任务需被分配成员确认后锁定到一台设备，在本机以 Cursor / Codex / Claude Code 的交互式会话执行。详见下文。

## 文档与文件存储

文档在右侧文件浏览器中查看。Agent 必须调用保存产物工具，文件才会进入文档库；沙箱临时文件可能过期。

当前文档原始字节和不可变版本保存在 MySQL。**未接入对象存储。** 后续大型附件应接入对象存储：MySQL 保留文档/版本/权限/校验值，对象存储保存本体，由服务端鉴权后提供访问。此迁移需要存储适配和旧文件搬迁，不能只改数据库连接。

## 共序 MCP

MCP 通过本机 Agent 连接器接入：连接器授权后调用 `POST /api/connector/mcp-credential` 为当前账号申领（或沿用）账号令牌，并写入已检测到的 Agent 配置（Cursor `~/.cursor/mcp.json`、Codex `~/.codex/config.toml` + `COTHREAD_MCP_TOKEN` 环境变量、Claude Code user-scope），剩余有效期不足 7 天时自动续期。一个账号只需一个令牌，个人设置里不再有「连接本地 Agent」页面；令牌疑似泄露时在连接器点「重置 MCP 令牌」（`POST /api/connector/mcp-credential/reset`），旧令牌立即失效并自动重写本机配置。写入的配置等价于：

```json
{
  "mcpServers": {
    "cothread": {
      "type": "http",
      "url": "http://localhost:3100/mcp",
      "headers": { "Authorization": "Bearer <你的账号令牌>" }
    }
  }
}
```

工具：`get_connection_guide`、`list_projects`、`get_project_context`、`get_member`、`get_iteration_context`、`get_document_version`、`list_document_changes`、`upload_cache_draft`、`post_message`、`upload_official_file`、`list_tasks`、`get_task`、`accept_task`、`reject_task`、`update_task`。无需 SKILL：MCP initialize 的 instructions 与 `get_connection_guide` 内置完整使用协议。`/api/tokens` 系列接口保留给服务端与测试使用，不在界面暴露。

账号令牌加密密钥由 `CREDENTIAL_ENCRYPTION_KEY`（32 字节 base64）指定，未配置时自动保存在 `.local/credential-encryption.key`。部署迁移和备份时须保留这份密钥（与数据库备份分开保管）。密钥和令牌明文不应进入版本库。

在迭代输入框上方点击「复制会话信息」获取 `projectId` 和 `threadId`。需要在消息中添加新附件时，先调用 `upload_cache_draft` 再用 `post_message.refs` 引用；需要独立入库时调用 `upload_official_file`，文件直接进入项目正式文档目录，返回版本也可在后续消息中引用；`get_document_version` 用于下载版本内容。沙箱产物由云端 Agent 的 `publish_artifact` 写入。完整说明见 MCP `get_connection_guide`。

## EdgeOne Makers 部署

本仓库包含 Makers 的 Express 云函数入口和 Agents 长任务入口，详见 [Makers 部署说明](docs/makers.md)。仅上传 `dist` 不能运行后端；Git 构建需包含 `cloud-functions/`、`agents/` 和 `edgeone.json`。`main` 推送后由平台自动构建部署。生产站点默认 `https://cothread.z2l.top`。

## 本机 Agent 连接器

左侧「本地连接器」查看自己已授权的设备。程序已内置 Node 运行时；首次运行检测 Git 与三种本机 Agent（Cursor Agent CLI、Codex CLI、Claude Code），至少装有一种即可在线。授权后列出该账号加入的项目。一个账号同一时间只保留一台连接器；这一台可同时绑定多个项目。每个项目先选 Git 仓库，可选再填仓库内路径（留空则与仓库相同）。本地路径只保存在电脑上。

「交给本机 Agent」：项目内任意可编辑成员的连接器在线即可开启。发起人自己的连接器在线时可不 @；离线时必须 @ 一名连接器在线的成员。小祥生成待确认任务，确认后锁定到一台设备。是否推送 Git 以该项目在连接器上的开关为准。

执行闭环：连接器投递任务 → 在本机拉起交互式 TUI → 过程用共序 MCP 回群 → 人在连接器结案。

- **开始**：连接器按当前 HEAD 创建独立 Git worktree，并在项目路径（未配置则等同仓库根）打开 Agent 会话（Cursor `agent --trust --resume <chatId>`、`codex`、`claude --session-id`），首条提示引用连接器生成的任务卡（任务原文、范围/Git 规则、共序 MCP 回报要求）。装有多个 Agent 时首次开始选一次，之后同一任务沿用。主仓库未提交改动不会阻止开始。
- **会话中**：开发人员在窗口里直接打字、追问、审批工具。Agent 通过共序 MCP `post_message` / `upload_cache_draft` 报进度、交随消息文件；正式文件独立使用 `upload_official_file`。关闭窗口不算完成：任务转为 `paused`（「会话已关闭」），连接器每 5 分钟续租；连接器重启后仍可续租。
- **继续**：按记录的会话 ID 恢复原对话（`agent --resume` / `codex resume` / `claude --resume`），允许未提交改动。**重试**则新建会话。
- **完成并通知 / 失败**：由人在连接器点击。完成时可填写摘要，连接器按开始时的基线计算 Git Diff 一并回传，迭代群聊出现以执行成员身份发出的结案消息；任务详情可查看 Diff。
- **放弃 / 重试**：在连接器放弃会把任务池任务标为已放弃；之后重试会重新排队并新开一条执行记录，不会停留在已放弃。

任务每次状态变化都会记录（从什么状态到什么状态、由谁——成员 / 小祥 / 任务级 Agent / 本机连接器 / 系统——以及原因），与指派、转交、拒绝等事件合成任务详情里的「变更记录」；「执行轮次」单独列出每一轮由谁执行及其结果。

两套令牌：`ctc_` 设备令牌只用于连接器与共序通讯；账号 MCP 令牌供 Agent 以开发人员身份读写共序。安装合并、秘密不合并：连接器授权后调用 `POST /api/connector/mcp-credential`（仅 ensure、仅本账号）取得 MCP 令牌，写入 Cursor `~/.cursor/mcp.json`（并执行 `agent mcp enable cothread`）、Codex `~/.codex/config.toml`（令牌放用户环境变量 `COTHREAD_MCP_TOKEN`）、Claude Code 用户级 MCP（`claude mcp add --transport http --scope user`），令牌剩余不足 7 天或在网页重置后自动回写。写入失败只记录日志，不影响收任务；已打开的会话需新开才生效。

构建使用 `npm run connector:build`，固定校验 Node 22 LTS x64。运行数据写入 `%LOCALAPPDATA%\CoThreadConnector`（`tasks.json` 保存任务与会话绑定、`task-cards/` 为任务卡、`worktrees/` 为任务独立工作副本）。共序不存储安装包、不提供下载入口，也不执行自动更新。Windows 原生终端下 Cursor TUI 在信任提示后可能不响应键盘，连接器已固定传 `--trust`；如仍无响应，关闭窗口后点「继续」重开即可。

## 普通服务器／容器部署

阿里云 RDS 默认 MySQL 端口为 `3306`，将 `DATABASE_URL` 配为 `mysql://RDS_USER:RDS_PASSWORD@YOUR_RDS_HOST:3306/cothread`（特殊字符须 URL 编码）。应用主机需能访问该地址并加入白名单。

1. 创建 MySQL 8.4 数据库，迁移本地完整备份（含附件）。空库则运行迁移与初始账号创建。
2. 修改 `DATABASE_URL`；需要 TLS 时设 `DATABASE_SSL=true`；自签发 CA 用 `DATABASE_SSL_CA`。
3. 配置 `HOST=0.0.0.0`、实际 HTTPS `APP_ORIGIN`、`COOKIE_SECURE=true`，前置 HTTPS 反向代理。
4. 复制数据库与模型配置到云端密钥。运行 `npm ci && npm run build`，启动单个 `npm start` 实例。
5. MySQL 的 `max_allowed_packet` 建议至少 32 MiB。配置定期备份并演练恢复。
6. 应用需要可写 `.local/agents` 缓存目录；权威会话快照在 MySQL。升级 DSH 时需同步验证会话恢复适配器。

测试使用独立 `TEST_DATABASE_URL`（如本机 `127.0.0.1:3307/cothread_test`）。未配置时会回退 `DATABASE_URL`，但日常库 `cothread` / `cothread_dev` 禁止被测试清库。`npm test` 会清空目标库全部表后重新迁移，绝不能指向生产库或正在使用的开发库。

## 项目结构

```text
web/                 React 工作台（群聊、文档浏览器、项目管理、监控）
public/              静态页（含 about_us.html）
server/              HTTP API、权限、协作业务、MCP、沙箱路由
cloud-functions/     EdgeOne 云函数入口
agents/              Makers 长任务入口
migrations/          版本化 MySQL 结构
scripts/             安装初始化、迁移、示例、连接器构建
tests/               真实数据库集成测试
docs/                架构与部署说明
.local/              本机 MySQL 程序、数据、私有配置（不入库）
```

产品介绍页：工作台页脚「关于我们」，或直接打开 `/about_us.html`。

首版面向小团队单实例试用。暂不包含 SSO、推送通知、全文搜索、文件在线编辑（可预览）、对象存储和多实例作业调度。不要把当前版本当作完成全部生产加固的公共 SaaS。
