# 共序 CoThread

让每次讨论都有承接，让每个决定都有出处。

共序是面向小团队的协作工作台：一个项目是长期工作空间，一次迭代对应一个群聊。成员在群聊里讨论、引用精确文档版本、把任务交给内置助手「小祥」或本机 Codex；成果进入不可覆盖的文档版本，人工审核后归档。线上试用：[https://cothread.z2l.top](https://cothread.z2l.top)。

本地服务使用 `.local/sandboxes`，EdgeOne Makers 部署使用平台原生沙箱。MySQL 保存业务数据、附件字节与 Agent 会话快照。当前版本 `0.1.11`。

## 工作台长什么样

打开项目后是三栏布局：

- **左侧**：可收缩。列出当前项目的迭代；底部打开「项目管理」（基础信息、长期总结、成员）和「小祥 Agent 监控」。
- **中间**：迭代群聊。默认勾选「交给 Agent 处理」；可引用文档版本、上传附件（进入当天缓存目录）、梳理讨论、停止或重试执行。
- **右侧**：**文档浏览器**，不是成员面板。一棵树浏览项目正式文件、当前迭代的缓存文件与产物文件；可选中预览 Markdown / 文本代码 / 图片 / PDF / Word / Excel / PowerPoint。

人工不能在缓存或产物目录里直接新建、移动或改内容；可查看、引用、下载、审核、重命名、软删除。正式文件区可由负责人整理文件夹、上传与另存。

## 本机启动

需要 Node.js 22.19+。本地 MySQL 为 Oracle 官方 MySQL 8.4.9 Windows ZIP 版，不注册系统服务，监听 `127.0.0.1:3307`。

```powershell
npm install
npm run setup
npm run mysql:start
npm run db:migrate
npm run dev
```

打开 <http://localhost:3100>。`npm run setup` 将首次初始化的账号和随机密码保存在 `.local/initial-admin.json`；`npm run db:migrate` 在迁移后会自动写入超级管理员（也可单独运行 `npm run db:seed`）。可在账号设置中改密码；数据库只保存加盐哈希。新增项目成员由项目负责人操作。

登录可用账号名或已绑定邮箱。邮箱注册与「重置密码」走验证码（10 分钟有效）；公开入口可启用人机验证。工作空间设置里可绑定邮箱。

本机运行时，工作文件默认位于 `.local/sandboxes`。命令由本机 Git Bash 执行，进程不继承数据库或服务密钥；仍能访问当前 Windows 账号可访问的系统资源，因此只应运行可信任务。容器级隔离需要另行安装 Docker、WSL 沙箱或其他隔离运行时。

本地 `.env` 保留数据库、模型和执行后端配置及 `CREDENTIAL_ENCRYPTION_KEY`。普通参数使用代码默认值；部署差异仍可通过环境变量覆盖，详见 [云端配置](docs/cloud-environment.md)。

`npm run setup` 不覆盖已有 `.env`。模型与 MySQL 配置分别设置，不要提交 `.env` 或 `.local`。

```powershell
npm run mysql:stop   # 优雅关闭本地数据库
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

### 账号与项目

- 登录、全局账号目录与项目成员分离；同一账号可加入多个项目，各项目分别分配负责人／成员／只读。负责人可新建通用账号，账号创建后不会自动获得任何项目权限。
- 邮箱注册、绑定邮箱、验证码重置密码；超级管理员可在系统管理里看项目与账号。
- 项目与迭代群聊，消息按数据库序号排序；页面先加载最近 50 条，向上滚动加载更早记录，隐藏页暂停轮询。

### 文档与归档

- 文档二进制入库，单文件 5 MiB、SHA-256、不可覆盖版本与并发版本编号。上传和 Agent 发布都不等于审批通过；本地 AI 令牌不能审批或归档。
- 项目正式文件 + 每迭代「缓存文件 / 产物文件」：对话上传按 Asia/Shanghai 自然日进入缓存；任务成果进入产物。当前迭代只能引用自己的文件和项目正式文件；跨范围用「另存至正式文件」。
- 消息引用精确到文档版本；归档事务保存结论、消息、审核、版本摘要和执行结果。已确认的产物最新版会另存到正式文件（名称带版本号，不含缓存）。归档后本迭代不可改，后续迭代仍可引用旧版本。
- 删除为可恢复软删除；头像上传前缩至 256 像素。Markdown 预览不渲染原始 HTML、不加载外部图。

### 小祥（对用户是一个身份）

聊天里始终显示为「小祥」。内部三级：

| 层级 | 对内称呼 | 职责 |
|------|----------|------|
| 一级 | 老翁 · 项目知识库管理员 | 项目级：成员认识、文档摘要、正式文件整理、迭代归档总结与长期记忆 |
| 二级 | 任务调度员 | 每个迭代一套上下文：接待、判断是否执行、派三级任务 |
| 三级 | 任务执行者 | 每项工作独立 DSH 会话、工作目录与轨迹 |

- 一级四类维护任务各有独立上下文，按项目复用；成员发言与文档变更先入待整理队列，由维护入口定期处理（Makers 用 `/cothread-memory` 定时；本机约 60 秒扫描）。
- 单个迭代最多同时 7 个三级执行任务，加上二级接待共 8 个工作名额。第 8 个新执行到来时说明太忙、只陪聊，不静默排队。同一成员再 @ 补充要求时更新已有任务（DSH steering），不另开任务。
- 监控页可看一级四类、二级迭代用量；三级在任务卡片「聊天」里看原生会话并追加要求。任务最长 10 分钟、最多 40 次工具调用。
- 多人项目未明确 @ 时，二级可选择沉默；仅成员与助手两人时默认回复。成员本地 AI 提交不会触发回复循环。
- 「梳理讨论」在输入框预填基于已有上下文的请求，不弹消息条数选择框。

### 执行环境与进度

- 内置 DSH Agent：读项目资料、在沙箱里改文件、跑命令与测试、把成果存成文档版本。云端走 Makers 原生沙箱（会话级实例，目录隔离，检查点有配额）；长期成果必须发布到文档库。
- 聊天显示执行进度、工具输入与结果，支持停止、失败重试。服务重启后运行中任务标中断，避免自动重放有副作用的操作。
- 会话快照、工具过程入 MySQL。二级上下文增量纳入成员发言，约 900K token 自动压缩。

### 连接本地 Agent（MCP）

账号单令牌、30 天有效、可重置；哈希鉴权，明文用 AES-256-GCM 保存。7 个 Streamable HTTP 工具，调用者身份由服务端凭据确定。详见下文。

### 本机 Codex 连接器

Windows 单文件程序（`npm run connector:build`），由系统外部渠道分发，网页不提供安装包。授权后按项目绑定本地 Git 根目录；「本机 Codex」开关在有在线连接器的项目上可用。任务需被分配成员确认后锁定到一台设备。详见下文。

## 文档与文件存储

右侧文档浏览器与弹窗复用同一文件树。Agent 必须调用保存产物工具，文件才会进入文档库；沙箱临时文件可能过期。

当前文档原始字节和不可变版本保存在 MySQL。**未接入对象存储。** 后续大型附件应接入对象存储：MySQL 保留文档/版本/权限/校验值，对象存储保存本体，由服务端鉴权后提供访问。此迁移需要存储适配和旧文件搬迁，不能只改数据库连接。

## 连接本地 Agent

在工作空间设置点击「连接本地 Agent」，创建账号令牌，并按客户端要求配置 Streamable HTTP MCP。一个账号只需一个令牌，重置时旧令牌全部失效。

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

工具：`get_connection_guide`、`list_projects`、`get_project`、`get_iteration_context`、`get_document_version`、`post_message`、`submit_document`。点击「复制安装文档」会填入当前真实令牌。无需 SKILL：MCP initialize 的 instructions 与 `get_connection_guide` 内置完整使用协议。

账号令牌加密密钥由 `CREDENTIAL_ENCRYPTION_KEY`（32 字节 base64）指定，未配置时自动保存在 `.local/credential-encryption.key`。部署迁移和备份时须保留这份密钥（与数据库备份分开保管）。密钥和令牌明文不应进入版本库。

在迭代输入框上方点击「复制会话信息」获取 `projectId` 和 `threadId`。`post_message` 可一次发送正文、多个 `files` 和已有版本 `refs`；来源文件进入当天缓存目录。`submit_document` 提交任务产物，默认进入产物目录。完整说明见界面「连接本地 Agent」。

## EdgeOne Makers 部署

本仓库包含 Makers 的 Express 云函数入口和 Agents 长任务入口，详见 [Makers 部署说明](docs/makers.md)。仅上传 `dist` 不能运行后端；Git 构建需包含 `cloud-functions/`、`agents/` 和 `edgeone.json`。`main` 推送后由平台自动构建部署。生产站点默认 `https://cothread.z2l.top`。

## 本机 Codex 连接器

左侧「本地连接器」查看自己已授权的设备。程序已内置 Node 运行时；首次运行检测 Git 和 Codex CLI。授权后列出该账号加入的项目。一个账号同一时间只保留一台连接器；这一台可同时绑定多个项目。本地路径只保存在电脑上。

「本机 Codex」：项目内任意可编辑成员的连接器在线即可开启。发起人自己的连接器在线时可不 @；离线时必须 @ 一名连接器在线的成员。小祥生成待确认任务，确认后锁定到一台设备。是否推送 Git 以该项目在连接器上的开关为准。完成后通过任务结果和 Git Diff 人工审核。

构建使用 `npm run connector:build`，固定校验 Node 22 LTS x64。运行数据写入 `%LOCALAPPDATA%\CoThreadConnector`。共序不存储安装包、不提供下载入口，也不执行自动更新。

## 普通服务器／容器部署

阿里云 RDS 默认 MySQL 端口为 `3306`，将 `DATABASE_URL` 配为 `mysql://RDS_USER:RDS_PASSWORD@YOUR_RDS_HOST:3306/cothread`（特殊字符须 URL 编码）。应用主机需能访问该地址并加入白名单。

1. 创建 MySQL 8.4 数据库，迁移本地完整备份（含附件）。空库则运行迁移与初始账号创建。
2. 修改 `DATABASE_URL`；需要 TLS 时设 `DATABASE_SSL=true`；自签发 CA 用 `DATABASE_SSL_CA`。
3. 配置 `HOST=0.0.0.0`、实际 HTTPS `APP_ORIGIN`、`COOKIE_SECURE=true`，前置 HTTPS 反向代理。
4. 复制数据库与模型配置到云端密钥。运行 `npm ci && npm run build`，启动单个 `npm start` 实例。
5. MySQL 的 `max_allowed_packet` 建议至少 32 MiB。配置定期备份并演练恢复。
6. 应用需要可写 `.local/agents` 缓存目录；权威会话快照在 MySQL。升级 DSH 时需同步验证会话恢复适配器。

测试使用独立 `TEST_DATABASE_URL`（如 `cothread_test`）。未配置时会回退 `DATABASE_URL`，但 **`cothread_dev` 禁止被测试清库**。`npm test` 会清空目标库全部表后重新迁移，绝不能指向生产库。

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
