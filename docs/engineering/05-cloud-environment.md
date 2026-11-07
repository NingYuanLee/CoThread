# 云端环境与发布

维护约定：本文是发布流程与云端环境的唯一真源。每次发布都应核查并更新本文：删去失效或过时的步骤、命令、版本和判断条件，把新问题及已验证的处理办法合并到对应章节；发布失败或中止也要记录确认的问题与遗留事项。逐次发布的原始记录不留在本文，按发布日期拆到 [发布记录目录](releases/)，本文只保留索引表与可复用的流程、故障恢复和验收知识。

最近流程核查：2026-11-04 至 11-05 凌晨共十二次发布——「按来源治理记忆 / 项目现状改 Markdown」「删除文档后的失效项目进程信号清理」「项目记忆结算修复 + 时间线分页 + index.html 预加载修复」「项目记忆读取性能（轻量读 + 按需详情）与核验理由截断」「项目进程信号改为按水位扫描生成（迁移 221）」「项目进程去文档化 + 逐条核验 + 任务聚合 + 忽略入口（迁移 222）」「发布重启 502 窗口收缩」「WPS/旧版二进制 Office 读取与预览派生文件（迁移 223）」「DSH 整链升级 0.2.2-rc.1 与 ECS Node 24.18 运行时切换」「监控会话派活展示与用量补齐」「DSH 压缩会话日志解析与子 Agent 思考/正文展示」「任务会话时间线与轨迹用量」。十二次都重核了门禁、打包清单、OOS 上传和上线验收；逐次记录见 [发布记录目录](releases/)。本轮补充了 Alibaba MCP 通道现状、测试库锁残留检查、`OOS_GetDeployStatus` 参数约束、`visibleFileIndexSql` 整表开销实测、迁移 221/222 线上应用核对，以及本机沙箱管道限制下的构建与上传替代路径。

2026-11-06 又发布一次（`server/` 全量迁到 TypeScript 等五组改动）：首次发布中止——发布脚本的 release 完整性检查与 systemd 单元仍指向 `server/index.js`，而包里已是 `server/index.ts`，脚本判定「release 不完整」后删目录退出，实例 `current` 纹丝不动而 OOS 只显示「等待你的操作」；修脚本与 `Dockerfile` 后重发上线。排查路径与两轮记录见 [2026-11-06 发布记录](releases/2026-11-06.md)。

应用后端需要常驻 Node.js 进程（Node.js 24.9+，DSH 0.2.2 起强制要求）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；生产环境固定为阿里云 ECS 单实例 + RDS，本机开发用便携版 MySQL。

在 ECS 上把变量配置到后端运行环境（`/opt/cothread/.env`）。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，环境里已设置的同名变量优先。

2026-11-04 DSH 整链升级到 `0.2.2-rc.1`（npm 的 `next` tag；`0.2.2` 尚无正式版）：`package.json` 中全部 `@deepseek-ai/dsh*` 与 `cordis-plugin-group` 同步升级，`engines.node` 提到 `>=24.9.0`。本机 Node 24.18 满足；Docker 固定 `node:24.18-bookworm-slim`，CI 只保留 `24.x`，ECS 启动钩子改装 `/opt/cothread/node-runtime-24.18.0`。代码侧同步了 `startActivation`、会话恢复 `resume` 透传、官方新增装配条目（filesystem / tool-fs / working-directory / tool-executor-native / image-offload / checkpoint-policy）与移除的 invariants / `list-agents` 子路径。**已于 2026-11-04 晚间第九次发布上线**：ECS 启动钩子先安装并切换到 Node `v24.18.0`，`current` 为 `/opt/cothread/releases/20261104T162834Z`，公网健康为 `ok`、执行器 ready、8 槽；详见 [2026-11-04 发布记录](releases/2026-11-04.md)。登录后的真实 Agent 会话与压缩阈值仍未实机验收。

| 变量                                                                       | 配置                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DATABASE_HOST_INTERNAL` / `DATABASE_HOST_PUBLIC`                          | 正式库内网 / 外网地址，格式 `host:port/dbname`；运行时自动选：阿里云 ECS 用内网，本机用外网                  |
| `DATABASE_ENDPOINT`                                                        | 可选强制 `public` 或 `internal`；不设则按主机类型自动判断                                                    |
| `DATABASE_AUTH`                                                            | 正式库账号密码，合写为 `user:password`（仅按第一个冒号拆分）                                                 |
| `TEST_DATABASE_HOST_INTERNAL` / `TEST_DATABASE_HOST_PUBLIC`                | 测试库内网 / 外网地址，格式 `host:port/dbname`                                                               |
| `TEST_DATABASE_AUTH`                                                       | 测试库 `user:password`；`npm test` 会整库清表，勿指向正式库名                                                |
| `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL`                               | 小祥调度与 子 Agent 派活共用的默认模型：OpenAI Responses 兼容接口根地址、密钥、`模型名` 或 `模型名@推理强度` |
| `KNOWLEDGE_MODEL_BASE_URL` / `KNOWLEDGE_MODEL_API_KEY` / `KNOWLEDGE_MODEL` | 可选的老翁知识整理模型覆盖；未设置时继承 `MODEL_*`                                                           |
| `CREDENTIAL_ENCRYPTION_KEY`                                                | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致                                                   |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD`                                            | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME`                                                     |
| `SMTP_URL`                                                                 | SMTP 连接地址，例如 `smtps://账号:授权码@服务器:465`；账号和授权码中的特殊字符需 URL 编码                    |
| `EMAIL_FROM`                                                               | 系统邮件显示的发件人名称和地址                                                                               |
| `MEMORY_MAINTENANCE_TOKEN`                                                 | 定时维护专用令牌（`POST /api/memory-maintenance`），属于敏感信息                                             |

`CREDENTIAL_ENCRYPTION_KEY` 与 `MEMORY_MAINTENANCE_TOKEN` 须人工配置并长期固定；`npm run setup` 不会生成它们。迁移已有部署时保留原有令牌加密密钥（环境变量，或将已有 `.local/credential-encryption.key` 的 32 字节二进制内容编码为 base64），否则无法解密原来的账号令牌。不要提交密钥；也不要在运行时自动新建密钥文件。

本地 `.env` 仅保留 `.env.example` 中列出的必要项。监听 `0.0.0.0:3100`、站点 `https://cothread.z2l.top`、HTTPS 时 Secure Cookie 已在代码写死，不必再配。

任务在 `.local/sandboxes` 中执行。数据库模型配置默认由老翁、小祥与实际子 Agent 派活共用，可单独覆盖 老翁。仅在没有数据库配置时，`KNOWLEDGE_MODEL_*` 用于老翁知识整理，`MODEL_*` 作为 小祥调度和实际 子 Agent 派活的共享基线。旧的 `COORDINATOR_MODEL_*` / `EXECUTOR_MODEL_*` 仅作为迁移兼容变量；环境变量模型字段可写成 `模型名@推理强度`，省略推理强度时基线默认使用 `low`。推理强度可取 `off`、`none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra`；管理页用独立选项设置推理强度。

模型调用统一使用 OpenAI Responses API。各套 `*_MODEL_BASE_URL` 是服务商提供的 API 基础地址，程序不会擅自补 `/v1`；Responses 适配器只在该地址后追加 `/responses`。命令以应用进程的操作系统账号在 `.local/sandboxes` 中执行，不具备容器级隔离；生产环境只有这一条执行路径。

本地首次账号由 `npm run setup` 生成至 `.local/initial-admin.json`，不进入版本库；`npm run db:seed` 读取它完成数据库账号初始化。之后每次 `npm run dev` 启动都会把本机超级管理员密码重置为固定值 **`cothread-dev`**（需要临时换口令时设 `DEV_ADMIN_PASSWORD`），写入 `.local/initial-admin.json` 与登录备忘；该重置只在 `COTHREAD_DB_TARGET=dev` 且数据库在本机时执行，生产初始化仍走 `ADMIN_PASSWORD`（至少 12 位）。ECS 空库可临时设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 完成初始化，已有账号只依赖数据库。

### 模型配置同步与上游故障检查

自平台模型配置功能上线后，有 `platform_model_settings` 记录时以数据库为准；无记录才使用下述环境变量规则。管理员从 `/admin/model-settings` 查看当前来源、版本和分层覆盖，并通过“校验并保存”启用数据库配置。发布不会自动把环境变量写入配置表，也不会替换已有密钥。已有数据库记录损坏或无法解密时明确报错，不回退环境变量。首次保存仍需填写模型 API 密钥；必须保留服务器原有 `CREDENTIAL_ENCRYPTION_KEY`。

代码发布不会同步本机 `.env`：发布包排除该文件，release 的 `.env` 始终链接 `/opt/cothread/.env`。修改本机模型地址、密钥或模型名后，必须单独核对服务器的有效配置；不要以本机配置一致推断生产一致。`MODEL_*` 优先供 小祥/子 Agent 共用，未配置时各自回退旧 `COORDINATOR_MODEL_*` / `EXECUTOR_MODEL_*`；老翁只在未填写 `KNOWLEDGE_MODEL_*` 时继承 `MODEL_*`，不会继续继承旧 coordinator 配置。因此只有旧变量的环境不能直接删除老翁覆盖。迁移时先补齐完整 `MODEL_*` 三项，再按需保留完整老翁覆盖，并清理旧变量以避免误判。

2026-10-22 成员认识整理故障已核实：本机三层使用相同 DeepSeek 地址、模型和密钥，但 ECS 仍保留旧变量，老翁/子 Agent 指向另一兼容网关。项目维护日志中上下文准备和 DSH 启动成功，模型执行连续返回 503；从同一 ECS 对老翁专用 Responses 接口做最小请求，得到 502 `Upstream authentication failed`，默认 coordinator 路由同类请求返回 200。该证据确认旧专用上游鉴权链路存在故障，未确认网关内部具体哪项凭据失效。

恢复时先确认本机执行器没有运行或排队任务，备份服务器原配置（仅在服务器保留且限制权限），只同步模型相关变量，保留数据库、加密密钥和其他配置，然后重启 systemd 服务。凭据应通过安全传输或加密载荷传送，不能放入发布包、命令日志或诊断输出。若新配置无法启动或模型校验失败，恢复本轮备份并重启；服务健康只证明进程和数据库恢复，还须验证真实整理任务。

本轮曾尝试仅删除老翁覆盖，因服务器缺少完整 `MODEL_*` 基线而未通过模型配置校验，已立即恢复原配置；随后按本机配置同步完整基线及 老翁 覆盖。最终服务 active、健康接口 ok、执行器 ready；项目 `aab430a9-52af-463f-b0de-543efea6f40a` 的成员整理 run `536dbdb4-e750-49dd-ab22-99c9b914fda6` 于北京时间 15:54:45 完成，处理 2 项且 error 为空。此次为生产配置修复，无代码包发布或数据库迁移；不代表其他项目和全部业务已验收。

构建命令：`npm ci && npm run build`。常驻 `npm start` 与本地 `npm run dev` 启动时会应用未执行的迁移并尝试写入超级管理员（需 `.local/initial-admin.json` 或 `ADMIN_EMAIL`/`ADMIN_PASSWORD`）。也可单独运行 `npm run db:migrate`。当前版本运行单个应用实例。

## ECS 发布

新版本解压到 `/opt/cothread/releases/<id>`，在临时端口以 `--production --health-probe` 启动并探活 `/api/health`；**通过后**才把 `/opt/cothread/current` 原子切到新目录并 `systemctl restart cothread`。探活进程保留迁移和生产静态/API 路径，但不启动后台执行器，不打断沙箱记录，也不在启动或退出时停止 Admin 预览。临时探活失败时，脚本清理本轮 release，`current` 与正式进程不切换。发布脚本只认 `"status":"ok"`，它表示进程和数据库可读，不表示执行器正在干活；探活进程的 `executor.ready: false` 是预期结果，锁应仍归正式进程。正式切换后才核查新进程 `executor.ready: true`。任务排队看本机 `GET /api/health/work`（仅回环地址），不要把它放进发布探活，避免执行器抖动导致整站切换失败。共享 `.env`、`.local` 在 `/opt/cothread/`，不随 release 覆盖。

失败保护有两个边界：临时探活启动也会应用共享数据库迁移，**不切换代码不等于数据库已回滚**；切换后正式端口探活失败时，脚本会报错，但 `current` 已指向新版本，**不会自动回切**。恢复前先核对实际 `current`、systemd 状态和已执行的迁移，确认旧代码与新表结构兼容后再决定恢复方式。依赖安装失败也可能留下未上线的 release 目录，应按执行日志确认状态。

本地：配置 `.env.deploy.local`（可复制 `.env.deploy.local.example`）后执行 `npm run deploy:ecs`（等同 `build` + `ecs-pack`，并写入 `.code_deploy/last-deploy.json`）。再用 Cursor 阿里云 MCP `OOS_CodeDeploy` 按清单上传，或在 ECS 上 `RELEASE_TGZ=... bash scripts/ecs-promote.sh`。仅打包可加 `--pack-only`。

### 发布前按顺序核查

1. 检查 `git status` 与目标分支，核实未跟踪文件来源，再暂存提交。截图、运行时附件、`.env`、私钥及生成目录不应混入代码；本地临时文件可用 `.git/info/exclude` 排除并保留原文件。本次曾出现 504 个根目录哈希名称图片，约 130 MB，抽查为界面截图。
2. 先运行 `npm run lint`、`npm run test:unit` 和 `npm run build`。类型声明必须与运行时代码一致，组件回调的参数也要覆盖实际调用。格式化后，源码匹配测试应容许换行与空白变化，不能靠恢复旧排版让断言通过。

   2026-11-04 发布前全量测试暴露 4 项失败：3 项是测试仍在断言旧的 `memory_page` / `thread` 入队行为，与「只有项目级信号进入项目进程」的现行设计冲突，按文档语义改成断言不入队；1 项是真缺陷——正式文件原地替换内容后 `version_id` 不变，`shouldReuseDocumentSummary` 仅凭「同版本已有摘要」直接出队，导致新内容沿用旧摘要。修复为必须比对 `file_index_entries.summary_sha256` / `summary_mime` 与当前内容一致才复用，并补单测。修复后全量 1039/1039 通过。判定测试过时还是代码缺陷，以工程文档写明的现行行为和迁移注释为准，不能为了变绿直接改期望值。

   2026-10-22 首轮 340 项无数据库测试有 2 项 DSH `sdk-minimal` 初始化超时；将 `context-runtime.test.js`、`model-runtime-config.test.js` 用 `node --test --test-concurrency=1` 单独复跑，3 项均通过。未确认超时根因，不能据此声称并发运行已稳定。构建还发现两个菜单调用用内联 `visibility`，超出 `OverlayLayoutStyle` 白名单；改为公共 `.is-positioning` 状态规则，保留锚点测量前隐藏行为后构建通过。

   2026-10-28 第二次发布前，当轮已确认全量测试通过，但 `npm run build` 里的 `tsc --noEmit` 仍失败：新建的 `shared/work-status.js` 没有配套 `.d.ts`，`Notifications` 对 `Partial` 计数直接读 `count.total` 时 `count` 可能为空。补了 `shared/work-status.d.ts`，相加改为 `count?.total || 0` 后构建通过。测试通过不能代替这次类型检查；这两处是在口头确认测试之后改的，本轮没有为此再跑测试。

   `npm run lint`、`npm run test:unit` 和 `npm run build` 这三项在 push 与 PR 上由 CI 强制执行（[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)，Node 24.x，另有 MySQL 8.4.9 容器内跑 `npm test`）。本地先跑是为了在上传前发现问题，不是唯一闸门；**CI 通过不代替发布前的完整集成测试、迁移链核对和上线验收**。

3. 单独验证生产依赖锁文件。开发机已有 `node_modules` 时构建通过，不能证明 ECS 能执行 `npm ci`。锁文件不同步时，在本地同步后提交，避免在 ECS 上改成 `npm install` 绕过锁定：

   ```powershell
   npm install --package-lock-only --ignore-scripts --no-audit --no-fund
   npx --yes npm@10.9.8 ci --omit=dev --dry-run --ignore-scripts --no-audit --no-fund
   ```

   上述 npm 10 预检用于覆盖本次生产安装问题；后续应按目标 ECS 的 npm 主版本选择。`--dry-run` 只验证安装计划，不代表包下载和安装脚本已成功。

4. 核对项目及依赖的 Node 要求和 ECS 实际版本。本次 DSH 0.2.2 要求至少 `24.9.0`（`package.json` 的 `engines` 同步；旧版 `@dimina/compiler@1.2.2` 的 `22.22.3` 要求已被覆盖），ECS 原为 `22.22.3`。[启动钩子](../../scripts/ecs-codedeploy-start.sh)已加入版本检查：需要升级时，将固定版本安装到 `/opt/cothread/node-runtime-24.18.0`，验证可执行文件后再切换 `/usr/local/bin/node`，并保留 `node.previous`。以后依赖提高要求时，须同步核对 `package.json`、钩子和本文，不能只忽略 `EBADENGINE`。
5. 有迁移时，先在独立测试库验证完整迁移链，并检查已有生产库的升级路径。本次 114 号迁移错误更新了已被 046 号迁移删除的 `agent_capabilities`、`agent_capability_contracts`，直到独立 MySQL 验证才发现。修复尚未上线的迁移；不要随意改写已应用迁移或手工重写校验和。触发器语句需按[迁移执行器](../../scripts/migrate.js)的处理方式执行。

   2026-11-04 核对迁移与升级路径的做法：本机 `cothread` 账号只有 `cothread_dev`、`cothread_test*`、`cothread_refactor_check` 等库的授权，新建任意库名会被拒绝（`ERROR 1044`），核对库应复用已授权的 `cothread_refactor_check`。先在空库执行完整迁移链（本轮 201/201），再用恢复出来的真实数据副本从旧状态升级（本轮 183 → 201，含 220 的正文迁移与旧现状表删除），两者都通过才打包。迁移 218—220 在空库与真实数据上均只执行一次；198 号生产库本次升级到 201，218/219 为加表与回填列，220 会复制旧现状正文后删除 `project_status_nodes` / `project_status_revisions` / `project_status_source_snapshots` 并收敛 `project_memory_settlements` 列。

   平台模型配置的 118 号迁移仅新增单例配置表，初始不写配置。新版本探活也会应用该迁移；若随后回切旧代码，可保留新增表，不执行删除表或重写迁移记录。旧代码不会读取此表，因此启用数据库模型配置后再回切旧代码，会重新采用服务器环境变量，恢复前须核对两者。

   2026-11-06 核对正式库现状（只读，DoH 解析真实 IP 后连公网端点，未写任何数据）：正式库是 **MySQL 8.0.36**，`max_connections=10520`，`innodb_buffer_pool_size=768MB`，`innodb_flush_log_at_trx_commit=1`，`lock_wait_timeout=31536000`；`Threads_connected=25`、`Max_used_connections=506`、`Uptime≈58 天`。正式库当前迁移停在 223。`versions` 表 573 行、data 39.5MB / index 0.2MB（体积几乎全在 `content` 的 LONGBLOB 上），`artifacts` 447 行、`messages` 1046 行、`file_index_entries` 411 行。

   连接池上限从 8 提到 20（`server/db.ts` 的 `DEFAULT_POOL_SIZE`，可用 `DATABASE_POOL_SIZE` / `DATABASE_WORK_POOL_SIZE` 覆盖）后，单实例两个池合计 36 个连接，相对 `max_connections=10520` 与 `Max_used_connections=506` 都有充足余量，不需要额外调整 RDS 的 `max_connections`。

   迁移 224（`ALTER TABLE versions ADD INDEX versions_filename_lower ((LOWER(filename))), ALGORITHM=INPLACE`）已在与正式库**同实例同版本（8.0.36）**的 RDS 测试库上用同形临时表演练通过：函数索引要求 MySQL ≥ 8.0.13，8.0.36 满足；`ALGORITHM=INPLACE` 可用（63ms），显式指定它的意义是**万一不能 INPLACE 就直接失败，而不是退化成整表复制**（`versions` 存文件内容，复制代价高）。实测确认 `LOCK=NONE` 不被支持（`ER_ALTER_OPERATION_NOT_SUPPORTED_REASON: … Try LOCK=SHARED`），即建索引期间写入被短暂挡住；正式库 `versions` 只有 39.5MB，挡住的时间在秒级，不构成上线风险。该迁移**不幂等**（重复执行报 `ER_DUP_KEYNAME`），依赖 `schema_migrations` 按名记录保证只跑一次。

   给 `versions` 再加**第二个**函数索引会失败（`INPLACE ADD or DROP of virtual columns cannot be combined with other ALTER TABLE actions. Try ALGORITHM=COPY`）。以后若要再加函数索引，不能照抄迁移 224 的写法，要改成先显式加虚拟列再单独建索引。

6. 远端测试库出现 `PROTOCOL_CONNECTION_LOST` 时，先区分连接故障与业务断言失败。测试配置用的已经是公网域名 `TEST_DATABASE_HOST_PUBLIC`，不是内网地址；本机 TUN 仍把该域名解析到 `198.18.0.0/15`，所以“改用公网域名”不能绕过假 IP。2026-10-26 该主机名解析到 `198.18.30.123`，整轮 431 项都是连接丢失、0 项断言失败，不能记成业务回归。2026-10-27 系统 `Resolve-DnsName` 与未打补丁的 `node` 仍分别得到 `198.18.124.171`、`198.18.124.172`。桌面插件 `dsh-real-ip` 只改当前进程的 `dns.lookup`：在测试进程启动时 `--import` 它的 `installProcessLookup` 后，同一公网域名不再落在 `198.18`，并且能连上 `cothread_test`。这个补丁不会传给测试里用干净 `env` 拉起的子进程，系统自带的 `Resolve-DnsName` 和 `mysql` 客户端也仍然看到假 IP。公网 RDS 上串行全量很慢：2026-10-27 一轮 900 项用了约 82 分钟，而本机 `cothread_test_2` 上一轮大约 6 分钟；慢的是跨网 SQL，不是 `DELETE` 重置被改回 `TRUNCATE`。本机 `127.0.0.1:3307` 没有名为 `cothread_test` 的库，仍有 `cothread_test_2` 到 `_5`；本机 `cothread` 账号能写 `_2`，RDS 的 `TEST_DATABASE_AUTH` 不能连这些本机库。要在本机库复跑时，只向测试子进程注入 `TEST_DATABASE_HOST_PUBLIC=127.0.0.1:3307/cothread_test_2` 和本机账号的 `TEST_DATABASE_AUTH`，凭据从现有本地配置读取，不打印、不提交。`npm test` 会清空目标测试库，不能指向生产库或 `cothread_dev`。`cothread_deploy_test` 若未单独授权不可直接使用。

   2026-10-28 第三次发布前确认：用本机 `cothread` 账号在 `cothread_test_2`…`_5` 上并行跑全量（5 路、925 项、约 7 分钟）和串行 `npm test` 都可行，只需向测试进程注入 `TEST_DATABASE_HOST_PUBLIC=127.0.0.1:3307/cothread_test_2` 与本机账号的 `TEST_DATABASE_AUTH`；某个库刚整库重建时会先花 1–2 分钟重放 152 条迁移。并行分片首轮曾因旧版测试把 test_5 结构改残而连锁失败，重建该库后复跑全绿，不是业务回归。

   2026-11-06 补充：桌面插件 `dsh-real-ip` 已不在本机，本机连公网 RDS 仍会因 TUN 假 IP 报 `PROTOCOL_CONNECTION_LOST`。**只读核对正式库**的可用途径是先用 DoH（`https://dns.alidns.com/resolve?name=<域名>&type=A`）拿到真实 IP，再按该 IP 建连：`.env` 未启用 `DATABASE_SSL`，MySQL 连接不需要 SNI，用 IP 直连即可。实测 `rm-bp1ms41b96tgs544puo.rwlb.rds.aliyuncs.com` 的系统解析是 `198.18.116.142`（假 IP），DoH 解析得到真实地址后可正常连上正式库并读到 `VERSION()`。这条路径**只用于只读核对**；写操作仍走 ECS 上的应用，不从本机直连。

7. 完成最终构建后再打包。推荐 `npm run deploy:ecs`；只有确认 `dist/` 对应最终前端源码时，才用 `npm run deploy:ecs -- --pack-only`。不要并行构建和打包；源码、锁文件或发布钩子改动后都应重打包。清单由[打包入口](../../scripts/ecs-deploy.mjs)生成，不手改 `.code_deploy/last-deploy.json`，发布期间也不要继续修改待上传源码。
8. 提交并推送待发布修改，确认远端分支 HEAD 与本地一致；记录提交号、产物文件名及 SHA-256，再进入上传步骤。清单已由打包入口写入 `commit`（打包时的 HEAD 提交号）、`commitDirty`（打包时工作区存在未提交改动）、`sha256` 与 `bytes`（产物摘要与字节数），人工记录以清单为准；`commitDirty` 为真时先确认未提交改动是否属于本轮发布。

### Alibaba MCP 调用与失败重试

先用 `LOCAL_AnalyzeDeployStack` 确认项目类型。目标实例、地域、应用和分组须来自已确认的发布配置，不通过枚举 ECS 临时挑选。本项目使用 `ecs-promote`、共享目录和 systemd，调用 `OOS_CodeDeploy` 时应将清单中的 `applicationStart`、`applicationStop` **一起传入**，不能换成通用的 `npm start` 启停命令。`releaseTgz` 对应 `file_path`，`objectName` 对应 `object_name`。

2026-11-04 核对本机通道现状：插件 `dsh-alibaba-mcp` 的默认命令仍指向 `D:\tools\mcp\vendor\alibaba\.venv\Scripts\alibaba-cloud-ops-mcp-server.exe`，该路径已不存在；本机实际安装在 `D:\tools\mcp\vendor\alibaba-codex\Scripts\alibaba-cloud-ops-mcp-server.exe`。本轮发布所在的 DSH 会话没有暴露 `OOS_*` / `ECS_*` 工具，改用仓库自带 `@modelcontextprotocol/sdk` 的 `StdioClientTransport` 起这个 exe（`--transport stdio --visible-tools OOS_CodeDeploy,OOS_GetDeployStatus,OOS_GetLastDeploymentInfo,OOS_RunCommand,ECS_DescribeInstances`），AK/SK 只从用户级环境变量读入子进程，不写文件、日志或命令行。本轮注册表代理为 `127.0.0.1:2080`，同一子进程直连成功，没有复现 `SSLEOFError`；下方空 `proxies` 补丁只在复现时使用。只读核对用 `OOS_RunCommand`（Cloud Assistant，结果在 `Outputs.commandOutputs`）；`LOCAL_RunShellScript` 是本机工具，`working_directory` 传 `/opt/cothread` 会报 `Invalid path`，不能拿来读 ECS。

**停止钩子不能调用顶层 `exit 0`。** 本次 OOS 将停止与启动钩子拼接到同一个 shell；停止钩子提前退出后，上传和执行仍被记录为成功，启动钩子却完全没运行，正式版本一直停在 10 月 15 日。[停止钩子](../../scripts/ecs-codedeploy-stop.sh)现在使用 `:`，由 [ecs-promote.sh](../../scripts/ecs-promote.sh)负责探活后切换。修改钩子后，可在 Git Bash 检查后续命令仍能执行，预期输出 `HOOK_CONTINUES`：

```bash
{ cat scripts/ecs-codedeploy-stop.sh; printf '\nprintf HOOK_CONTINUES\n'; } | bash
bash -n scripts/ecs-codedeploy-start.sh
```

`OOS_CodeDeploy` 返回 HTTP 200 只表示发布请求已受理。随后调用 `OOS_GetDeployStatus`，同时检查应用分组状态和本次执行状态；即使出现 `Released`，仍须完成下一节的实际版本核对。

| 现象                                                                          | 本次确认的原因                                                                                                                                                                                                                                                                                                                                                                                                              | 下次处理方式                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Released`，但页面资源及 `current` 仍是旧版本                                 | 停止钩子的 `exit 0` 终止了拼接后的整个脚本                                                                                                                                                                                                                                                                                                                                                                                  | 先看 `deployCurrentRevision` 输出及组合命令，检查停止钩子，避免反复上传同一包                                                                                                                                                                                                                                                                                                                                                        |
| `npm ci` 报 `EUSAGE`，锁文件中 `postcss-selector-parser@7.1.6` 不满足 `7.1.7` | 已有本地依赖掩盖锁文件不一致                                                                                                                                                                                                                                                                                                                                                                                                | 本地同步锁文件并做生产安装预检，提交、推送、重打包后重试                                                                                                                                                                                                                                                                                                                                                                             |
| `EBADENGINE`                                                                  | ECS Node 低于编译器要求                                                                                                                                                                                                                                                                                                                                                                                                     | 核对版本检查及独立运行时安装结果，验证新 Node 后再切换                                                                                                                                                                                                                                                                                                                                                                               |
| `ReleaseWaiting`，新发布报 `DeployFailed.ApplicationGroup`                    | 上一轮执行因 `FailurePause` 停在失败处                                                                                                                                                                                                                                                                                                                                                                                      | 先读取失败子任务，修复原因，再取消那一条已确认失败的 execution，之后重新调用 CodeDeploy；不删除应用分组、不新建 ECS                                                                                                                                                                                                                                                                                                                  |
| `ReleaseWaiting` 且执行是 `Waiting`、**0 个任务失败**、实例上 `current` 没变  | 2026-11-06 实际踩到：发布脚本判「release 不完整」后自行退出，OOS 只显示「等待你的操作」。真因不在云侧：脚本要求的入口文件在包里不存在（当时是 `server/index.js`，而包里已是迁移后的 `server/index.ts`）                                                                                                                                                                                                                     | 用 `OOS_RunCommand` 只读看实例：`readlink -f /opt/cothread/current`、`ls -1t /opt/cothread/releases`、`ls -lt /opt/cothread/logs`、`tar -tzf /root/<包名> \| grep server/index`、以及 `grep ExecStart /etc/systemd/system/cothread.service`。**入口类问题先看这五项**，别急着重发。确认是脚本问题就修脚本重打包重发；执行仍在等待时先 `CancelExecution` 再重发，不要重复上传                                                         |
| 临时探活报 `EXECUTOR_ALREADY_RUNNING`，随后 `ReleaseWaiting`                  | 2026-10-22 临时生产进程也启动了 worker，与正式进程争抢 `cothread-executor` 锁                                                                                                                                                                                                                                                                                                                                               | 使用 `--health-probe`，同时跳过启动/退出的预览及沙箱清理；不能靠提前停止正式服务来让探活抢锁。已新增真实子进程回归，验证已有执行器锁与运行记录在探活启动、健康读取和正常退出后均保持不变                                                                                                                                                                                                                                             |
| 发布停留在 `Releasing`                                                        | 可能仍在下载和安装依赖；execution 已成功后分组状态也会晚几十秒才变成 `Released`                                                                                                                                                                                                                                                                                                                                             | 看安装进度及子任务状态。2026-10-28 线上 `npm ci` 装 2266 个包约 1 分钟。该轮 execution 于 UTC 01:03:52 成功，分组到 01:04:16 才变为 `Released`。这段时间不要重复部署                                                                                                                                                                                                                                                                 |
| 分组 `DeployParameters` 仍是旧包名和 `systemctl stop`                         | 该字段不是本轮实际执行的命令。2026-10-28 与 2026-10-29 第二次发布时分组已是本轮 `Released`，但 `ObjectName` 仍是 `cothread-release-20260927T101450Z.tgz`                                                                                                                                                                                                                                                                    | 不要用它判断实际命令。以本次 execution 的 `deployCommandOutput` 为准，调用时仍传入当前 `ecs-promote` 启停钩子                                                                                                                                                                                                                                                                                                                        |
| 轮询响应里出现 `FailurePause`，任务数却还在增加                               | `Mode: FailurePause` 是模板的失败暂停策略，成功或仍在运行的执行里也有这个词。2026-10-29 第二次发布在 4/8 时状态仍是 `Running`，随后 8/8 `Success`                                                                                                                                                                                                                                                                           | 不要因为响应里出现这个词就判定失败或重复上传。只把执行 `Status: Failed`，或 `FailedTasks` 大于 0，当成失败                                                                                                                                                                                                                                                                                                                           |
| Alibaba `LOCAL_RunShellScript` 一直无结果                                     | 本次分别达到 30 秒、120 秒超时                                                                                                                                                                                                                                                                                                                                                                                              | 说明已试路径；必要时用本机已安装的 Alibaba SDK 和既有环境凭据读取 OOS/ECS 诊断信息。不要把 AK/SK、临时签名 OSS URL 写入文档或日志；发布入口仍用 MCP CodeDeploy                                                                                                                                                                                                                                                                       |
| MCP 与 Tea SDK 调 ECS/OOS 报 `SSLEOFError`                                    | 2026-10-23 上午 curl 能握手并得到 HTTP 400，Tea 签名请求在握手阶段被对端断开；约 4 小时后同一 SDK 重试成功。当天下午 curl 仍返回 HTTP 400，立刻重试仍是 `SSLEOFError`。同一虚拟环境里新开的 Python 能握手，已运行的 MCP 进程不能；稍后同一次会话里原调用恢复成功。本机 TUN 把 `*.aliyuncs.com` 解析到 `198.18.0.0/15`                                                                                                       | 不要改用通用 `npm start`。没有 execution 前视为未上传。2026-10-23 曾用 `C:/Users/liyun/.dsh/profiles/desktop/alibaba-fakeip/launch.py` 包装：只在阿里云域名落到该网段时改用公共 DoH 的真实地址，TLS 仍用原主机名，实测解析到公网地址、握手后对端返回 HTTP 400。2026-11-04 核对时该包装路径已不存在，按本节开头 2026-11-04 的本地 stdio 方式起新进程即可。已运行的 MCP 要等下次重启 App 才更新路径。发布入口仍是 MCP `OOS_CodeDeploy` |
| `OOS_GetDeployStatus` 每轮都报 `Unexpected keyword argument deploy_region_id` | 该工具 schema 只接受 `name` + `application_group_name`，没有区域参数；按 manifest 带 `deploy_region_id` 会一直被 pydantic 拒绝                                                                                                                                                                                                                                                                                              | 轮询前先 `tools/list` 读 schema，只传两个必填参数。2026-11-04 下午发布踩过，修正后正常返回 `Released`                                                                                                                                                                                                                                                                                                                                |
| 全量测试前几个文件各卡 120 秒后报「等待测试库锁超时」                         | 先前被中止的后台测试进程仍活着并持有 `GET_LOCK('<db>:<db>')`；`tests/database.js` 等锁 120 秒，与断言无关                                                                                                                                                                                                                                                                                                                   | 跑全量前先确认没有残留测试进程，并用 `SELECT IS_USED_LOCK('<db>:<db>')` 核对锁；单独复跑失败文件即可判断是环境竞争还是回归。2026-11-04 下午本轮 3 项超时单独复跑 3/3 通过                                                                                                                                                                                                                                                            |
| 全部 ECS/OOS 调用都 `SSLEOFError`，但 `OOS_GetLastDeploymentInfo` 仍成功      | 2026-10-28 实测根因：本机注册表系统代理为 `http://127.0.0.1:5090`；阿里云 Tea SDK（darabonba）调用 `requests.Session.send(proxies={})` 时，requests 会把注册表代理合并进来，该代理对 TUN 分配的 `198.18.x` 假地址做 TLS 时直接 EOF。普通 `requests.get`/curl 不传空 `proxies` 均正常，`alibabacloud_oss_v2` 也正常。`OOS_GetLastDeploymentInfo` 读的是本地 `.code_deploy/application.json`，不是云端，不能据它判断 MCP 可用 | 不要反复重试同一调用，也不要把 SDK 改成 HTTP。用新起的同款 MCP 子进程按清单调用（见下节「系统代理导致 MCP 全部 SSLEOFError 的恢复路径」）；发布入口仍是 MCP `OOS_CodeDeploy`，只是换一个刚启动的子进程                                                                                                                                                                                                                               |
| 本机沙箱内 Node/Python 起子进程一律 `spawn EPERM`                             | 沙箱禁止越权进程创建管道：`node --test`、`scripts/lint.js`（spawn git）、`vite build`（esbuild）、stdio MCP 全部失败；`stdio: "inherit"` 的命令仍可跑                                                                                                                                                                                                                                                                       | 门禁改用等价直接执行（`prettier --check` 单文件、`tsc`、`node <单个测试文件>`）；构建与打包需要一次 `danger-full-access` 授权；上传不必起 MCP，直接 `import alibaba_cloud_ops_mcp_server.tools.application_management_tools` 调 `OOS_CodeDeploy` / `OOS_GetDeployStatus`（同一实现，AK/SK 仍只从用户级环境变量读入）                                                                                                                 |
| 发布重启期间前端报 `服务暂时未返回有效数据（…，HTTP 502）`                    | 应用异常一律返回 JSON，非 JSON 的 502 必然是 nginx 生成的：进程重启窗口内 `3100` 无监听。实测 11-01 全天 0 条、11-02 仅 4 条（对应当天一次重启）、11-04 全部 502 都落在重启时刻；窗口长度取决于关闭排空，最长 30 秒（12:50 触发「关闭超过 30000ms 强制退出」），短则 1 秒                                                                                                                                                   | 已修：登记并主动结束 SSE、关闭时 1 秒宽限后 `closeAllConnections()`、关闭上限 30s→5s；前端 GET 网关类失败改为 3 次退避重试。验证见 [2026-11-04 发布记录](releases/2026-11-04.md#r8)                                                                                                                                                                                                                                                  |

定位执行问题时，从本次父 execution 的部署任务进入实例子执行，再读取 `deployCurrentRevision` 的状态、输出和实际命令。本次层级为 `<execution>.t0005.i0001`；任务名称和层级应按实际返回发现，不把后缀当作永久 API 契约。应用分组摘要不足以说明启动命令是否真正运行。

### 系统代理导致 MCP 全部 SSLEOFError 的恢复路径

- 症状：`OOS_CodeDeploy`、`OOS_GetDeployStatus`、`ECS_DescribeInstances` 全部报 `HTTPSConnectionPool(...) SSLError(SSLEOFError(... 'UNEXPECTED_EOF_WHILE_READING'))`；同时 curl 访问 `https://ecs.cn-hangzhou.aliyuncs.com/` 返回 HTTP 400（TLS 正常），本机 Python 裸 `ssl` 握手也正常。`oos.cn-hangzhou` 与 `ecs-cn-hangzhou` 两种域名表现一致，说明与域名无关。
- 已确认原因：Windows 注册表系统代理为 `http://127.0.0.1:5090`。Tea SDK（`darabonba.core`）在 `do_action` 里固定调用 `requests.Session.send(proxies={})`；requests 看到显式传入的空字典会把注册表代理合并进来，该代理对 TUN 分配的 `198.18.x` 假地址做 TLS 会直接 EOF。直接 `requests.get(...)` 不经过这条参数路径，所以能通；`alibabacloud_oss_v2` 走独立 HTTP 栈，也正常。
- 有效恢复（2026-10-28 实测部署成功 8/8）：

  1. 在 `%TEMP%` 下建临时目录放 `sitecustomize.py`，内容只做一件事：`requests.Session.send` 收到 `proxies == {}` 时把该参数去掉再转调原方法。
  2. 用仓库自带的 `@modelcontextprotocol/sdk`（`StdioClientTransport`）起一个全新的 `D:\tools\mcp\vendor\alibaba-codex\Scripts\alibaba-cloud-ops-mcp-server.exe`（旧 `.venv` 路径已不存在），参数与插件 `launch.js` 一致，只读核对时用 `--transport stdio --visible-tools OOS_CodeDeploy,OOS_GetDeployStatus,OOS_GetLastDeploymentInfo,OOS_RunCommand,ECS_DescribeInstances`。
  3. 子进程环境除 `PYTHONPATH` 指向第 1 步目录外，沿用插件的 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`（从用户级环境变量读取，不写日志/脚本/命令行）与 `ALIBABA_CLOUD_REGION_ID`。
  4. 按 `.code_deploy/last-deploy.json` 调 `OOS_CodeDeploy`，参数与平时一致（`application_start`/`application_stop` 用清单里的内容）；随后用同一子进程调 `OOS_GetDeployStatus` 轮询。

- 边界：已运行的插件子进程不会因为调用失败自动重连（只在配置或凭据变更时重连），长驻 App 里可能持续失败；发布时用上面的新进程路径即可，不需要改插件配置。临时目录与 `sitecustomize.py` 用完即删，不要把 AK/SK 写进任何文件。长期修法应让 SDK 不传空 `proxies`，或在系统代理中排除 `*.aliyuncs.com`，不要长期依赖临时补丁。

在 ECS 用独立 `node --input-type=module` 脚本只读核对数据库时，显式设置 `COTHREAD_DB_TARGET=prod`；独立脚本不会自动继承 `server/index.ts --production` 的目标推断。否则会报“缺少或无效的 COTHREAD_DB_TARGET”，这不代表正式网站的数据库连接失败。诊断只打印布尔状态、迁移名称及脱敏配置，不输出数据库认证串或模型密钥。

### 发布完成的验收证据

1. OOS 分组为 `Released`，对应 execution 为 `Success`；执行输出应出现本轮 `PKG`、新 release 目录、临时探活通过、`current` 切换和正式端口健康结果。
2. 在 ECS 核对 `readlink -f /opt/cothread/current`，并用 `systemctl show cothread -p ActiveState -p ExecMainStartTimestamp` 确认服务运行且启动时间属于本轮发布。
3. 浏览器导航到 `https://cothread.z2l.top/?release=<提交号>`，读取页面快照，检查登录页能加载；对照页面实际引用的 JS/CSS 文件名与本地 `dist/index.html`。查询参数用于减少旧页面缓存干扰，不能代替哈希核对。
4. 浏览器访问 `https://cothread.z2l.top/api/health?release=<提交号>`，确认 `status: ok`；正式切换后还需确认 `executor.ready: true`，才能说明执行器已就绪。登录页和健康接口通过不等于登录后全部业务功能已验收。
5. 将提交号、产物 SHA-256、OOS execution/revision、实际 release 目录、资源哈希和验收时间写入本地发布凭据（本次位于 `.code_deploy/verification/`，不进 Git）。测试结果分别记录构建、单元、针对性回归和完整集成测试，不合并成笼统的“全部通过”。

### 已知问题与恢复

#### 图片维护与文档摘要

图片维护故障排查：若准备上下文和 DSH 启动成功，而 `model_run` 报 `SDK image prompt requires an attachment store`，检查精简运行配置是否装配 `attachment-local`。SDK 日志只保存图片引用，会话快照也须保存和恢复附件；同时确认模型声明了图片输入，否则 SDK 可能把图片替换为省略提示。修复后必须验证模型实际收到图片并结合真实作业确认摘要，不能只凭进程健康或排队成功判断恢复。模型本身须支持视觉输入；不支持时不能把文字推测当图片识别结果。老翁快照仍有 10 MiB 压缩大小限制，图片累积过多时需关注快照失败。

2026-11-03 又核实一类图片维护失败：队列与文件索引报 `Image exceeds the configured per-side pixel limit.`，每 60 秒重试仍失败；对应文档是高 DPI 截屏 8436×1400，长边超过 `attachment-local` 默认准入 8192px。已在 `dsh-layer/laoweng-agent-patch.yml` 把该插件 `maxImageDimension` 调到 16384，仍由 DSH 归一化按 8192 长边 / 4.19MP / 4MB 缩图（同图实测归一化为 5025×834、约 158 KiB），`maxImagePixels` 64MP 总量上限不变；`document-organization-run` 的截图同样走老翁补丁，一并覆盖。验证方式：真实 DSH runtime 加载新补丁启动通过，且同一张图在默认配置下复现该报错、新配置下成功进入模型请求；运行中的本地 dev 服务在补丁写入后约 75 秒的维护运行（run `98987f57`）即完成该文档摘要，此前 20:22、20:24 两次运行均失败，摘要中模型自述看到的尺寸为 5025×834，与准入后归一化结果一致。本机测试库 `cothread_test` 连接仍被服务端断开（PROTOCOL_CONNECTION_LOST），数据库用例未能借此回归。长边仍超过 16384 或像素超过 64MP 的图会继续失败并每分钟重试，届时需在发送侧先缩放或切片。

同一轮还修了图片摘要与基础索引不一致的问题：模型看到的是归一化预览（如 8436×1400 被缩成 5025×834），旧提示词没给它原图事实，摘要会把预览尺寸当文件尺寸，和索引页「尺寸：8436×1400」冲突。文档摘要任务现在随输入传 `imageFacts`（原图宽高、格式、MIME、字节数，与索引页同一 `describeContent` 解析），图片分支明确要求「看到的是归一化预览、尺寸与清晰度以 imageFacts 为准、预览尺寸只能标注为归一化预览」。实测人工重新识别该文档：新摘要开头写原图 8436×1400、文件 88005 字节，并注明查看经由约 5025×834 的归一化预览，索引页同步更新后两者一致。其他图片任务（如文档整理截图核验）若同样依赖尺寸判断，也需要补同样的输入。

#### 发布重启期间的 502 窗口

- 现象：前端偶发 `服务暂时未返回有效数据（/api/projects/<id>，HTTP 502）`。应用层异常一律返回 JSON（`server/http-app.js` 错误中间件），**非 JSON 的 502 只可能是 nginx 生成**。线上 `nginx/1.30.4`、`proxy_pass http://127.0.0.1:3100`、`proxy_read_timeout 3600s`，未开上游 keepalive。
- 根因：`SIGTERM` 后 `server.close()` 立即停止接收新连接（nginx 开始 502），但要等连接与在途工作排空才退出，新进程在旧进程退出后才启动。presence 心跳 SSE `/api/threads/:id/viewing` 只在浏览器失焦时由客户端断开，`stopLiveOutputStreams` 只覆盖 agent live 流，未接管 presence 与老翁 SSE，这类长连接把排空拖到 30 秒上限。窗口长短取决于当时谁开着页面、有没有在跑任务。
- 改动：新增 `server/sse-streams.js`（`trackSse` / `endSseStreams` 登记表），presence SSE 与老翁 SSE 接入登记；`server/index.js` 关闭时先 `endSseStreams()`，1 秒宽限后 `server.closeAllConnections()` 强断剩余连接，关闭上限 30s→5s（`COTHREAD_SHUTDOWN_GRACE_MS` / `COTHREAD_SHUTDOWN_TIMEOUT_MS` 可覆盖）；`shared/json-response.js` 的 GET 网关类失败改为 3 次尝试（500ms / 1500ms 退避），**写请求仍不重放**。回归见 `tests/sse-shutdown.test.js` 与 `tests/json-response.test.js`。
- 判定口径：旧关闭逻辑下窗口 1–31 秒不等，且全部落在重启区间内（`NRestarts=0`，无自发崩溃）；新逻辑下 `systemctl restart` 从 Stopping 到就绪约 2 秒，剩余窗口为进程启动时间。**旧进程的关闭逻辑要到下次发版才被替换**，核对线上窗口前先确认跑的是新代码。
- 本次证据与复测数据见 [2026-11-04 发布记录](releases/2026-11-04.md)。

### 发布前测试中暴露的配置问题

- `sandbox_runs` 的 `runs_side_*` 触发器会更新 `threads.side_revision`，因此同一条 `UPDATE sandbox_runs JOIN threads` 或删除沙箱记录时引用 `threads`，会触发 MySQL `ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG`。已确认症状包括命令结束状态不能落库、随后的归档返回 409，以及集成清理钩子失败后连接未释放。`finishSandboxRun` 和启动中断清理改为同一事务内分开更新沙箱记录和活跃时间；已有事务连接使用保存点，第二次写入失败且调用方捕获错误时也不能提交半条完成记录。中断清理先锁定本次运行记录，活跃时间取这些记录的 `finished_at` 并保持单调；归档冻结语句不变。测试清理先查询迭代 ID，再删除沙箱记录，并在 `finally` 释放数据库。不要改写 113/114 等已应用迁移来绕过冲突。
- 纯前端小程序的 Dimina 运行配置允许 `cloudbase: null`。预览元信息读取需同时保护 `runtimeConfig` 和 `cloudbase`，返回 `envId: null`；不能因缺少云环境而抛空值异常。Admin 预览和静态托管仍要求 CloudBase 开发环境。
- 全量测试需同步当前接口和配置契约：本地执行器请求使用 `/local-executor/` 和 `/local-executor-tasks/`；114 号迁移已将旧 `connector_tasks` 更名，历史作者修复逻辑的测试需要映射到当前表名，但历史迁移文件不变。`enabled` 由 AppID 派生，不能再用 `enabled: false` 夹具代表未配置；先保存 AppID，再测试云环境、托管路径或运行时密钥读取。CloudBase 密钥对必须完整保存，缺失凭据的发布历史用例应构造真正无凭据场景；管理客户端缓存计数须排除保存凭据时的环境校验调用。公开认证配置新增字段、代码上传密钥文案变更也需同步断言，不能放宽生产校验让旧断言通过。

- 小程序模式在运行时代码中已存在，`shared/dialogue-mode.d.ts` 却未声明 `miniprogram`；Admin 启动回调还漏了实际使用的 `force` 参数。先以 `tsc` 结果校验声明和调用契约，再打包。
- VM 测试转换 `server/local-sandbox.js` 后，`./executor-fence.ts` 必须相对生产模块解析，使用 `createRequire(new URL("../server/local-sandbox.js", import.meta.url))`；相对测试文件解析会报模块不存在。格式化导致的换行变化，应修正测试的空白匹配，不改变生产行为。
- 首次保存 CloudBase 配置时，不能先加载尚不存在的完整运行时配置；已有凭据配置好后才核对环境与 AppID 的归属。凭据保存将 SecretId 留在提示字段、SecretKey 加密存储，调用凭据校验前必须重新拼回完整凭据，不能拿仅含 SecretKey 的存储载荷去校验。实现见[小程序配置](../../server/miniprogram-config.js)。
- CloudBase SDK 工厂按项目环境缓存，不能断言每个操作都新建实例。本次凭据注入测试覆盖的调用应复用 1 个数据面客户端，管理操作复用 manager、账号环境枚举单独创建，共 2 个 manager；见[凭据回归测试](../../tests/cloudbase-tool-credentials.test.js)。

- 2026-10-25 预发布测试暴露并已修复的源码缺陷（不是测试过期；修复后按文件单独复跑，再跑一次全量）：
  - `server/mcp.js` 的 `get_connection_guide` 处理器引用了只在 `createMcpServer` 作用域声明的 `instructions`，调用时抛 ReferenceError 并返回 `isError`，连带 3 个 MCP 用例失败；改为 `mcpInstructionsForSource(user.mcpSource)`。
  - `publish_artifact` 在没有 caller session 时不识别仍在运行的子 Agent，父回复结束后子 Agent 提交被 409「Agent 任务已停止」拒绝；`agent-tools` 需用 `liveChildAgentRun` 解析 `executorSessionId`。
  - `classifyTaskFailure` 首行 `status === "blocked"` 短路，而 settle 已把失败收敛成 blocked，导致 `platform_blocked` 永不生效、平台错误被误判可自动重试；分类必须传原始失败来源，显式报 blocked 时仍短路。
  - `saveMemberUnderstandings` 只在 upsert 里比较 `through_sequence`，但发言记忆页已先写入 wiki，再按「wiki 是事实」回写旧摘要缓存，过期摘要仍会覆盖新摘要；应在入口按 through_sequence 整批跳过。
- 2026-10-25 前端检查项：`web/workspace.css` 在 2026-10-24 截断恢复后混入 79 处与 `overlays.css` 同值的 `--overlay-*` 定义，以及 85 处缺 `@` 的 `media (...)` / `supports (...)`；后者让新增响应式规则全部失效。整条规则删除时必须连选择器头一起删，否则留下悬空 `:is(`，PostCSS 报 `Unclosed bracket`，dev 与 `vite build` 同时失败；本次两处悬空头就是这样暴露的。同类笔误还有选择器尾部多余分号（`theme-overrides.css` 与 `workspace.css` 的 `:is(... button.danger;)`）和 `supports not (...)` 漏 `@`，esbuild 只报 `Unexpected ";"`/`Unexpected "("` 警告、构建仍 exit 0，必须看构建日志而不是只看退出码。`npm run lint` 不解析 CSS 括号，删除后必须再用 `postcss.parse`（或直接 `npm run build`）验证，并在浏览器按 1600/1000/700/640 宽度核对：本次实测侧栏 255/210，模型设置 640 时单列。
- 2026-10-28 第三次发布前全量测试暴露并已修复的缺陷（修复后单文件复跑 + 全量复跑均通过）：
  - `tests/migration-charset.test.js` 会删掉 `message_quotes`、`version_recycle` 并只重放 018/019 两条迁移，019 之后还会 ALTER 这两张表的 080 号迁移不会重跑，被重建的 `version_recycle` 因此少了 `purged_at`；同分片后续用例连锁报 `Unknown column 'vr.purged_at'`（本轮首轮 test_5 有 12 个用例因此失败）。修复方式是按表名自动发现并一起重放 019 之后还会改这两张表的迁移，并断言 `purged_at` 恢复。已经损坏的测试库（迁移回执齐全但结构残缺）不会自动重放；清空该库 `schema_migrations` 后由 `testDatabase()` 整库重建，本轮 test_5 就是这样做才恢复的。
  - 迁移执行器的幂等重试原先只认不带定位子句的 `ADD COLUMN`；`ADD COLUMN ... AFTER x` 在列已存在时报 `ER_DUP_FIELDNAME` 且不被容忍，冷启动重试会直接中断。匹配正则已支持 `AFTER`/`FIRST`（位置不影响幂等判定，仍逐列核对类型、可空与默认值）。不要改写已应用的迁移来绕过这类问题。
  - Windows 本机沙箱 `kill()` 停不下正在执行的前台命令：bash 在前台命令运行期间会把 INT/TERM trap 推迟到命令结束之后才执行，trap 返回后 shell 还会继续跑后续语句；`taskkill /T /F` 也打不到 MSYS 派生的前台子进程。改为把用户命令作为后台作业 `{ cmd; } &` 交给 `wait`：`wait` 可被信号打断，trap 立即执行并按进程组 `kill -9 -- -PGID` 收掉整棵命令树，命令正常返回后再按组清理残留。实测 kill 生效 565–637 ms（原约 3.1 s、并发负载下 3.5 s+），被 kill 的命令 exit 143/137 且无后续输出。POSIX 分支未改；ECS 是 Linux，生产命令路径不受影响。回归：沙箱准入/生命周期/故障/重连/契约共 23 项通过。
  - 已读与收件箱契约同步：`markThreadRead` 现在要求用户正看着该迭代（presence 连接），人不在时不落已读；任务类消息以 `inbox:"skip"` 写入，不再额外产生 mention 站内信；`task_completed` 只在任务池状态真实跃迁时写——网页侧取消已把任务收敛成终态 `abandoned`，执行器事后回报完成不会复活它，这条路径不该出现「任务已完成」。测试按这三点对齐断言，不能用放宽旧期望代替。
- 2026-10-25 新增页面直接写原生 `input/select/textarea` 会被 `check-field-usage` 拦下；改走 `TextField/TextAreaField/SelectField`，紧凑高度用 `flush/dense` 加作用域变量，不要登记白名单绕过。主题产物过期用 `npm run theme:fallback` 重新生成。
- 2026-10-25 全量测试 83 分钟的根因与修复：`tests/database.js` 原来逐表 `TRUNCATE` 重置（104 张表，每张表多次 fsync）。全量套件共 222 次重置，磁盘压力大时单次从 4 s 恶化到 21 s，实测每次重置约 8,000 次同步落盘，占总时长约 94%。改为单事务 `DELETE`（`FOREIGN_KEY_CHECKS=0` 下 102 张表，提交后一次 `ALTER TABLE users AUTO_INCREMENT`）：同压力下单次 20.5 s → 1.6 s、fsync 3,775 → 68；全量 83.3 → 15.5 分钟，15–30 s 区间的用例从 162 项降到 1 项。注意 `DELETE` 不复位其他表的自增（`TRUNCATE` 会），测试不应依赖它们从 1 开始；`ip_geolocations` 与 `schema_migrations` 仍跳过。曾尝试进程内共享连接池把 222 次压到每文件一次，但池的 socket 持有事件循环、`beforeExit` 不触发，会让 `node --test` 子进程挂死，已放弃；要再减少重置次数只能把具体文件改成显式 `before/after`。本机测试实例另可设 `innodb_flush_log_at_trx_commit=2`、`sync_binlog=0` 继续降 fsync（只对测试实例，不改生产）。
- 2026-10-25 并行分片：`scripts/test-shards.mjs`（`npm run test:shards`）按「导入 `tests/database.js` 的文件」分到各自测试库，其余无库文件单独一路并发跑；仍要求 `TEST_DATABASE_HOST_PUBLIC=<host:port>/<db>` 与 `TEST_DATABASE_AUTH`，没有 `TEST_SHARD_DATABASES` 时只用当前库（于是得到 2 路）。默认会自动发现本机 `cothread_test`、`cothread_test_2`… 这些库并全部用上（只认这个前缀，不动 `cothread_prompt_test` 等独立库），也可用 `TEST_SHARD_DATABASES` 显式指定。本机已建 `cothread_test_2`…`cothread_test_5`：`cothread` 账号没有全局 `CREATE`，是用 root（`.local/mysql-client.ini`）执行 `CREATE DATABASE` + `GRANT ALL PRIVILEGES ON `cothread_test_N`.* TO 'cothread'@'127.0.0.1'` 建的；再要加库沿用同样方式。并行分片实测 6 路 **69 秒**跑完 867 项（403+464），迁移锁已按库名隔离，同库仍串行。正式发布证据仍以串行 `npm test` 为准，并行用于本地快速反馈。
- 2026-10-25 契约同步项（改测试期望即可，不放宽断言）：MCP 工具清单新增 `search_memory`；任务失败态收敛为 `blocked`，执行轮次仍记 `failed`；事件用量新增 `cacheReadTokens`；项目页签 `open` 改为 `COALESCE`，重开保持原位。
- 2026-10-26 图片文档摘要：`image/*` 且有内容时不再走非文本远期挂起，但空正文清理原先写在送摘要之前，PNG 队列会被直接删除。清理条件必须排除已识别的图片；没有候选摘要的非图片二进制仍挂起 30 天。老翁工具策略只放行 `beijing_time`，日志里的可用工具名单也要断言这个唯一例外，不能再期望空数组。
- 2026-10-25 时间与批量：全量 867 项，同一棵树改前 83.3 分钟；快速重置后 `npm test` 串行 15.5 分钟，`npm run test:shards` 并行 **4.2 分钟**（94 个带库文件 + 87 个无库文件两路，403+464 全过）。失败明细在套件结束才输出，中途只能看日志增量。lint 的 Prettier 只检查改动集，改动多时先对全部改动文件 `prettier --write`（本次 243 个文件）；`--env-file-if-exists=.env` 必须带上，否则会出现「Model is not configured」假失败。

## 发布记录

逐次发布的原始记录不留在本文，按发布日期拆到 [releases/](releases/)：每个文件照录当时的原文段落，包含提交号、产物与 SHA-256、execution、release 目录、门禁与测试结果、验收证据，以及当轮的未完成项和遗留问题。本文只保留可复用的流程、判断条件、故障恢复与验收要求；一次性事件留在记录文件里，不回流成流程。

| 日期       | 次  | 主题                                                                         | 涉及提交                                              | 结果                       | 记录                               |
| ---------- | --- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------- | ---------------------------------- |
| 2026-10-20 | 1   | 首次确认上线                                                                 | `3d9b175`                                             | 上线                       | [记录](releases/2026-10-20.md#r1)  |
| 2026-10-22 | 1   | 发布前核查                                                                   | —                                                     | 发布前核查（本次未上线）   | [记录](releases/2026-10-22.md#r1)  |
| 2026-10-22 | 2   | 首次发布失败（执行器锁冲突）                                                 | —                                                     | 中止/失败                  | [记录](releases/2026-10-22.md#r2)  |
| 2026-10-22 | 3   | 重发已确认上线                                                               | `ef18998`                                             | 上线                       | [记录](releases/2026-10-22.md#r3)  |
| 2026-10-22 | 4   | 平台模型配置功能上线                                                         | `f9f0cb5`                                             | 上线                       | [记录](releases/2026-10-22.md#r4)  |
| 2026-10-23 | 1   | 第一次发布中止                                                               | `09e9141`、`f9f0cb5`                                  | 中止/失败                  | [记录](releases/2026-10-23.md#r1)  |
| 2026-10-23 | 2   | 同日稍后 TLS 恢复后重新打包并上线                                            | `ee8f41d`                                             | 上线                       | [记录](releases/2026-10-23.md#r2)  |
| 2026-10-23 | 3   | 下午第二次发布中止                                                           | `0aa528d`                                             | 中止/失败                  | [记录](releases/2026-10-23.md#r3)  |
| 2026-10-23 | 4   | 同日下午 TLS 恢复后上传成功                                                  | —                                                     | 上线                       | [记录](releases/2026-10-23.md#r4)  |
| 2026-10-25 | 1   | 发布，一次上线                                                               | `09d3348`                                             | 上线                       | [记录](releases/2026-10-25.md#r1)  |
| 2026-10-25 | 2   | 本轮发布尝试（SSLEOFError，未上传）                                          | `a8b1804`                                             | 中止/失败                  | [记录](releases/2026-10-25.md#r2)  |
| 2026-10-26 | 1   | 重试发布成功                                                                 | `5f2bf48`                                             | 上线                       | [记录](releases/2026-10-26.md#r1)  |
| 2026-10-26 | 2   | 下午发布，一次上线                                                           | `d16c713`                                             | 上线                       | [记录](releases/2026-10-26.md#r2)  |
| 2026-10-26 | 3   | 晚间发布，一次上线                                                           | `5d34f17`                                             | 上线                       | [记录](releases/2026-10-26.md#r3)  |
| 2026-10-27 | 1   | 发布已上线                                                                   | `c23acc6`                                             | 上线                       | [记录](releases/2026-10-27.md#r1)  |
| 2026-10-27 | 2   | 同日再次发布并上线                                                           | `aa55511`、`ae7d826`                                  | 上线                       | [记录](releases/2026-10-27.md#r2)  |
| 2026-10-28 | 1   | 发布，一次上线                                                               | `25fac63`                                             | 上线                       | [记录](releases/2026-10-28.md#r1)  |
| 2026-10-28 | 2   | 同日第二次发布，一次上线                                                     | `25fac63`                                             | 上线                       | [记录](releases/2026-10-28.md#r2)  |
| 2026-10-28 | 3   | 第三次发布，一次上线                                                         | `e510615`                                             | 上线                       | [记录](releases/2026-10-28.md#r3)  |
| 2026-10-29 | 1   | 发布，一次上线                                                               | `dee5b4d`、`774a7c2`                                  | 上线                       | [记录](releases/2026-10-29.md#r1)  |
| 2026-10-29 | 2   | 第二次发布，一次上线                                                         | `e5b0b82`、`a6aab41`                                  | 上线                       | [记录](releases/2026-10-29.md#r2)  |
| 2026-11-02 | 1   | 主要文档图片作业修复发布（未提交、未推送）                                   | —                                                     | 构建并核对发布包，未上传   | [记录](releases/2026-11-02.md#r1)  |
| 2026-11-03 | 1   | 发布提交 a628fc6（早前一次尝试未完成）                                       | `a628fc6`                                             | 上线（早前一次尝试未完成） | [记录](releases/2026-11-03.md#r1)  |
| 2026-11-04 | 1   | 按来源治理项目记忆 / 项目现状改 Markdown                                     | `7316999`                                             | 上线                       | [记录](releases/2026-11-04.md#r1)  |
| 2026-11-04 | 2   | 删除文档后的失效项目进程信号清理                                             | —                                                     | 上线                       | [记录](releases/2026-11-04.md#r2)  |
| 2026-11-04 | 3   | 追加：index.html 开发入口 modulepreload 修复（随第三次发布上线）             | —                                                     | 上线（随第三次发布上线）   | [记录](releases/2026-11-04.md#r3)  |
| 2026-11-04 | 4   | 项目记忆结算修复 + 时间线分页 + index.html 预加载修复                        | `dbfc54f`、`4c08b90`、`5492b1f`、`aa195f1`            | 上线                       | [记录](releases/2026-11-04.md#r4)  |
| 2026-11-04 | 5   | 项目记忆读取性能（轻量读 + 按需详情）与核验理由截断                          | `baefd8c`                                             | 上线                       | [记录](releases/2026-11-04.md#r5)  |
| 2026-11-04 | 6   | 项目进程信号改为按水位扫描生成 + 面板信号收成按钮/弹窗                       | `15a1dab`                                             | 上线                       | [记录](releases/2026-11-04.md#r6)  |
| 2026-11-04 | 7   | 项目进程去文档化 + 逐条核验 + 任务聚合 + 忽略入口                            | `68b1b44`                                             | 上线                       | [记录](releases/2026-11-04.md#r7)  |
| 2026-11-04 | 8   | 发布重启期间的 502 窗口收缩                                                  | —                                                     | 上线                       | [记录](releases/2026-11-04.md#r8)  |
| 2026-11-04 | 9   | WPS/旧版二进制 Office 读取与预览派生文件                                     | `f3cd3b6`、`8c80518`                                  | 上线                       | [记录](releases/2026-11-04.md#r9)  |
| 2026-11-04 | 10  | DSH 整链升级到 0.2.2-rc.1 + ECS Node 24.18 切换                              | `7499491`                                             | 上线                       | [记录](releases/2026-11-04.md#r10) |
| 2026-11-04 | 11  | 小祥监控任务会话 / 记忆作业会话的派活展示与用量补齐                          | `c254da6`                                             | 上线                       | [记录](releases/2026-11-04.md#r11) |
| 2026-11-04 | 12  | DSH 压缩会话日志解析与子 Agent 思考/正文展示                                 | `9d2a2c7`                                             | 上线                       | [记录](releases/2026-11-04.md#r12) |
| 2026-11-04 | 13  | 小祥监控任务会话时间线与轨迹用量                                             | `eab4a0f`、`9d2a2c7`、`cafd752`、`7b2bd6a`、`1294784` | 上线                       | [记录](releases/2026-11-04.md#r13) |
| 2026-11-06 | 1   | server/ 全量迁 TypeScript 等（首次发布中止：部署脚本仍指向 server/index.js） | `d8a67dd`                                             | 中止（未切换版本）         | [记录](releases/2026-11-06.md#r1)  |
| 2026-11-06 | 2   | 修复部署路径后重新发布上线                                                   | `5a9ee4b`                                             | 上线                       | [记录](releases/2026-11-06.md#r2)  |
