# 云端环境变量

维护约定：每次发布都应核查并更新本文，删去失效或过时步骤，将新问题及已验证的处理办法合并到相应章节。发布失败或中止也要记录确认的问题与遗留事项。最近流程核查：2026-10-25；已核对构建、打包、启动及停止钩子，并把本轮预发布测试暴露的 CSS、输入控件和契约缺陷合并到文末问题清单。当天验收记录见下方。

应用后端需要常驻 Node.js 进程（Node.js 22.22.3+，推荐 24）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；生产环境固定为阿里云 ECS 单实例 + RDS，本机开发用便携版 MySQL。

在 ECS 上把变量配置到后端运行环境（`/opt/cothread/.env`）。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，环境里已设置的同名变量优先。

| 变量                                                                       | 配置                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_HOST_INTERNAL` / `DATABASE_HOST_PUBLIC`                          | 正式库内网 / 外网地址，格式 `host:port/dbname`；运行时自动选：阿里云 ECS 用内网，本机用外网                   |
| `DATABASE_ENDPOINT`                                                        | 可选强制 `public` 或 `internal`；不设则按主机类型自动判断                                                     |
| `DATABASE_AUTH`                                                            | 正式库账号密码，合写为 `user:password`（仅按第一个冒号拆分）                                                  |
| `TEST_DATABASE_HOST_INTERNAL` / `TEST_DATABASE_HOST_PUBLIC`                | 测试库内网 / 外网地址，格式 `host:port/dbname`                                                                |
| `TEST_DATABASE_AUTH`                                                       | 测试库 `user:password`；`npm test` 会整库清表，勿指向正式库名                                                 |
| `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL`                               | 小祥调度与 子 Agent 派活共用的默认模型：OpenAI Responses 兼容接口根地址、密钥、`模型名` 或 `模型名@推理强度` |
| `KNOWLEDGE_MODEL_BASE_URL` / `KNOWLEDGE_MODEL_API_KEY` / `KNOWLEDGE_MODEL` | 可选的老翁知识整理模型覆盖；未设置时继承 `MODEL_*`                                                          |
| `CREDENTIAL_ENCRYPTION_KEY`                                                | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致                                                    |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD`                                            | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME`                                                      |
| `SMTP_URL`                                                                 | SMTP 连接地址，例如 `smtps://账号:授权码@服务器:465`；账号和授权码中的特殊字符需 URL 编码                     |
| `EMAIL_FROM`                                                               | 系统邮件显示的发件人名称和地址                                                                                |
| `MEMORY_MAINTENANCE_TOKEN`                                                 | 定时维护专用令牌（`POST /api/memory-maintenance`），属于敏感信息                                              |

`CREDENTIAL_ENCRYPTION_KEY` 与 `MEMORY_MAINTENANCE_TOKEN` 须人工配置并长期固定；`npm run setup` 不会生成它们。迁移已有部署时保留原有令牌加密密钥（环境变量，或将已有 `.local/credential-encryption.key` 的 32 字节二进制内容编码为 base64），否则无法解密原来的账号令牌。不要提交密钥；也不要在运行时自动新建密钥文件。

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

   2026-10-22 首轮 340 项无数据库测试有 2 项 DSH `sdk-minimal` 初始化超时；将 `context-runtime.test.js`、`model-runtime-config.test.js` 用 `node --test --test-concurrency=1` 单独复跑，3 项均通过。未确认超时根因，不能据此声称并发运行已稳定。构建还发现两个菜单调用用内联 `visibility`，超出 `OverlayLayoutStyle` 白名单；改为公共 `.is-positioning` 状态规则，保留锚点测量前隐藏行为后构建通过。

3. 单独验证生产依赖锁文件。开发机已有 `node_modules` 时构建通过，不能证明 ECS 能执行 `npm ci`。锁文件不同步时，在本地同步后提交，避免在 ECS 上改成 `npm install` 绕过锁定：

   ```powershell
   npm install --package-lock-only --ignore-scripts --no-audit --no-fund
   npx --yes npm@10.9.8 ci --omit=dev --dry-run --ignore-scripts --no-audit --no-fund
   ```

   上述 npm 10 预检用于覆盖本次生产安装问题；后续应按目标 ECS 的 npm 主版本选择。`--dry-run` 只验证安装计划，不代表包下载和安装脚本已成功。

4. 核对项目及依赖的 Node 要求和 ECS 实际版本。本次 `@dimina/compiler@1.2.2` 要求至少 `22.22.3`，ECS 原为 `22.19.0`。[启动钩子](../../scripts/ecs-codedeploy-start.sh)已加入版本检查：需要升级时，将固定版本安装到 `/opt/cothread/node-runtime-22.22.3`，验证可执行文件后再切换 `/usr/local/bin/node`，并保留 `node.previous`。以后依赖提高要求时，须同步核对 `package.json`、钩子和本文，不能只忽略 `EBADENGINE`。
5. 有迁移时，先在独立测试库验证完整迁移链，并检查已有生产库的升级路径。本次 114 号迁移错误更新了已被 046 号迁移删除的 `agent_capabilities`、`agent_capability_contracts`，直到独立 MySQL 验证才发现。修复尚未上线的迁移；不要随意改写已应用迁移或手工重写校验和。触发器语句需按[迁移执行器](../../scripts/migrate.js)的处理方式执行。

   平台模型配置的 118 号迁移仅新增单例配置表，初始不写配置。新版本探活也会应用该迁移；若随后回切旧代码，可保留新增表，不执行删除表或重写迁移记录。旧代码不会读取此表，因此启用数据库模型配置后再回切旧代码，会重新采用服务器环境变量，恢复前须核对两者。

6. 远端测试库出现 `PROTOCOL_CONNECTION_LOST` 时，先区分连接故障与业务断言失败。可使用本机已安装的 MySQL 和专用测试库（当前本机可用的是 `127.0.0.1:3307/cothread_test` 及 `_2` 到 `_5`；`cothread_deploy_test` 若未单独授权不可直接使用），仅向测试子进程注入 `TEST_DATABASE_HOST_PUBLIC`、`TEST_DATABASE_AUTH`。凭据从现有本地配置读取，不打印、不提交；`npm test` 会清空目标测试库，不能指向生产或日常开发库。本机 RDS 测试地址若解析到 `198.18.0.0/15` 且无对应路由，应切换到这些独立本机测试库，不要把 DNS/握手失败记成业务回归。
7. 完成最终构建后再打包。推荐 `npm run deploy:ecs`；只有确认 `dist/` 对应最终前端源码时，才用 `npm run deploy:ecs -- --pack-only`。不要并行构建和打包；源码、锁文件或发布钩子改动后都应重打包。清单由[打包入口](../../scripts/ecs-deploy.mjs)生成，不手改 `.code_deploy/last-deploy.json`，发布期间也不要继续修改待上传源码。
8. 提交并推送待发布修改，确认远端分支 HEAD 与本地一致；记录提交号、产物文件名及 SHA-256，再进入上传步骤。

### Alibaba MCP 调用与失败重试

先用 `LOCAL_AnalyzeDeployStack` 确认项目类型。目标实例、地域、应用和分组须来自已确认的发布配置，不通过枚举 ECS 临时挑选。本项目使用 `ecs-promote`、共享目录和 systemd，调用 `OOS_CodeDeploy` 时应将清单中的 `applicationStart`、`applicationStop` **一起传入**，不能换成通用的 `npm start` 启停命令。`releaseTgz` 对应 `file_path`，`objectName` 对应 `object_name`。

**停止钩子不能调用顶层 `exit 0`。** 本次 OOS 将停止与启动钩子拼接到同一个 shell；停止钩子提前退出后，上传和执行仍被记录为成功，启动钩子却完全没运行，正式版本一直停在 10 月 15 日。[停止钩子](../../scripts/ecs-codedeploy-stop.sh)现在使用 `:`，由 [ecs-promote.sh](../../scripts/ecs-promote.sh)负责探活后切换。修改钩子后，可在 Git Bash 检查后续命令仍能执行，预期输出 `HOOK_CONTINUES`：

```bash
{ cat scripts/ecs-codedeploy-stop.sh; printf '\nprintf HOOK_CONTINUES\n'; } | bash
bash -n scripts/ecs-codedeploy-start.sh
```

`OOS_CodeDeploy` 返回 HTTP 200 只表示发布请求已受理。随后调用 `OOS_GetDeployStatus`，同时检查应用分组状态和本次执行状态；即使出现 `Released`，仍须完成下一节的实际版本核对。

| 现象                                                                          | 本次确认的原因                                                                | 下次处理方式                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Released`，但页面资源及 `current` 仍是旧版本                                 | 停止钩子的 `exit 0` 终止了拼接后的整个脚本                                    | 先看 `deployCurrentRevision` 输出及组合命令，检查停止钩子，避免反复上传同一包                                                                                                            |
| `npm ci` 报 `EUSAGE`，锁文件中 `postcss-selector-parser@7.1.6` 不满足 `7.1.7` | 已有本地依赖掩盖锁文件不一致                                                  | 本地同步锁文件并做生产安装预检，提交、推送、重打包后重试                                                                                                                                 |
| `EBADENGINE`                                                                  | ECS Node 低于编译器要求                                                       | 核对版本检查及独立运行时安装结果，验证新 Node 后再切换                                                                                                                                   |
| `ReleaseWaiting`，新发布报 `DeployFailed.ApplicationGroup`                    | 上一轮执行因 `FailurePause` 停在失败处                                        | 先读取失败子任务，修复原因，再取消那一条已确认失败的 execution，之后重新调用 CodeDeploy；不删除应用分组、不新建 ECS                                                                      |
| 临时探活报 `EXECUTOR_ALREADY_RUNNING`，随后 `ReleaseWaiting`                  | 2026-10-22 临时生产进程也启动了 worker，与正式进程争抢 `cothread-executor` 锁 | 使用 `--health-probe`，同时跳过启动/退出的预览及沙箱清理；不能靠提前停止正式服务来让探活抢锁。已新增真实子进程回归，验证已有执行器锁与运行记录在探活启动、健康读取和正常退出后均保持不变 |
| 发布停留在 `Releasing`                                                        | 可能仍在下载和安装依赖                                                        | 看安装进度及子任务状态；本次安装 2265 个包约用 2 分钟，包含下载重试。日志仍在推进时不要重复部署                                                                                          |
| Alibaba `LOCAL_RunShellScript` 一直无结果                                     | 本次分别达到 30 秒、120 秒超时                                                | 说明已试路径；必要时用本机已安装的 Alibaba SDK 和既有环境凭据读取 OOS/ECS 诊断信息。不要把 AK/SK、临时签名 OSS URL 写入文档或日志；发布入口仍用 MCP CodeDeploy                           |
| MCP 与 Tea SDK 调 ECS/OOS 报 `SSLEOFError`                                    | 2026-10-23 上午 curl 能握手并得到 HTTP 400，Tea 签名请求在握手阶段被对端断开；约 4 小时后同一 SDK 重试成功。当天下午 curl 仍返回 HTTP 400，立刻重试仍是 `SSLEOFError`。同一虚拟环境里新开的 Python 能握手，已运行的 MCP 进程不能；稍后同一次会话里原调用恢复成功。本机 TUN 把 `*.aliyuncs.com` 解析到 `198.18.0.0/15` | 不要改用通用 `npm start`。没有 execution 前视为未上传。桌面配置改为用该虚拟环境的 `python.exe` 启动 `C:/Users/liyun/.dsh/profiles/desktop/alibaba-fakeip/launch.py`：只在阿里云域名落到该网段时改用公共 DoH 的真实地址，TLS 仍用原主机名。2026-10-23 实测该包装解析到公网地址，TLS 1.3 握手后对端返回 HTTP 400。已运行的 MCP 要等下次重启 App 才走这条路径。发布入口仍是 MCP `OOS_CodeDeploy` |

定位执行问题时，从本次父 execution 的部署任务进入实例子执行，再读取 `deployCurrentRevision` 的状态、输出和实际命令。本次层级为 `<execution>.t0005.i0001`；任务名称和层级应按实际返回发现，不把后缀当作永久 API 契约。应用分组摘要不足以说明启动命令是否真正运行。

在 ECS 用独立 `node --input-type=module` 脚本只读核对数据库时，显式设置 `COTHREAD_DB_TARGET=prod`；独立脚本不会自动继承 `server/index.js --production` 的目标推断。否则会报“缺少或无效的 COTHREAD_DB_TARGET”，这不代表正式网站的数据库连接失败。诊断只打印布尔状态、迁移名称及脱敏配置，不输出数据库认证串或模型密钥。

### 发布完成的验收证据

1. OOS 分组为 `Released`，对应 execution 为 `Success`；执行输出应出现本轮 `PKG`、新 release 目录、临时探活通过、`current` 切换和正式端口健康结果。
2. 在 ECS 核对 `readlink -f /opt/cothread/current`，并用 `systemctl show cothread -p ActiveState -p ExecMainStartTimestamp` 确认服务运行且启动时间属于本轮发布。
3. 浏览器导航到 `https://cothread.z2l.top/?release=<提交号>`，读取页面快照，检查登录页能加载；对照页面实际引用的 JS/CSS 文件名与本地 `dist/index.html`。查询参数用于减少旧页面缓存干扰，不能代替哈希核对。
4. 浏览器访问 `https://cothread.z2l.top/api/health?release=<提交号>`，确认 `status: ok`；正式切换后还需确认 `executor.ready: true`，才能说明执行器已就绪。登录页和健康接口通过不等于登录后全部业务功能已验收。
5. 将提交号、产物 SHA-256、OOS execution/revision、实际 release 目录、资源哈希和验收时间写入本地发布凭据（本次位于 `.code_deploy/verification/`，不进 Git）。测试结果分别记录构建、单元、针对性回归和完整集成测试，不合并成笼统的“全部通过”。

本次确认上线的示例（2026-10-20，北京时间 23:35）：提交 `3d9b175`，execution `exec-09645b0d951c44b68268`，revision `rev-df93d45eec644199a30c`，实际目录 `/opt/cothread/releases/20261020T153349Z`；JS 为 `index-B_3USerl.js`，CSS 为 `index-DYaTvJio.css`，健康状态为 `ok` 且执行器就绪。构建、格式与架构检查通过，327 项单元测试和 7 项 CloudBase 针对性回归通过；**完整集成测试曾失败，修复后未完成全量复跑**。

2026-10-22 发布前核查：格式、架构、浮层、输入控件及主题产物门禁通过，生产 npm 10 锁文件 dry-run 通过；340 项无数据库测试中首轮 338 项通过，另 2 项初始化超时后串行复跑通过。独立本地 `cothread_deploy_test` 完整首轮测试共 738 项，721 项通过、17 项失败（含集成清理钩子）。修复后分别复验通过：集成/构建/活跃时间 37 项、补充的沙箱及事务回滚 10 项、开发服务器 15 项、本地执行器 5 项、CloudBase/认证配置/微信预览 66 项；这些组有重叠，不能相加作为独立用例总数。首轮失败项均已覆盖，未再执行一次完整测试集。本轮无数据库迁移改动。浏览器实测本地项目列表、状态下拉、详情全屏切换、新增表单输入/取消、对话模式菜单键盘导航和会话统计浮层；这些结果不代表全部业务验收。

2026-10-22 首次发布 execution `exec-e93c9ca9d0544d73bf6c` 因上述执行器锁冲突失败，未上线目录 `/opt/cothread/releases/20261022T062155Z` 已由脚本删除。失败后独立核对 `current` 仍为 `/opt/cothread/releases/20261020T153349Z`，systemd 仍 active，健康状态 ok 且正式执行器 ready。修复后的真实探活子进程回归通过；不以这项本地结果代替重新发布的线上验收。

2026-10-22 重发已确认上线：代码提交 `ef18998`，execution `exec-8729747ea87445cfb905`、revision `rev-31ab39fb69f148cc979d`，OOS 为 `Released`、执行为 `Success`；实际 `current` 为 `/opt/cothread/releases/20261022T063614Z`，systemd 为 active，启动时间北京时间 14:37:35。临时探活保留旧执行器锁且自身 ready 为 false，正式切换后新执行器 ready 为 true（7 个执行槽）。内置浏览器访问带提交号的首页，登录页正常；页面引用 `index-DN2dSsvq.js`、`index-CjxCJK9E.css`，与本地构建一致；公开健康接口为 ok 且执行器就绪。未在本轮全量验收登录后的业务。发布包 `cothread-release-20261022T063458Z.tgz` 的 SHA-256 为 `708e26fe123f59375b9d4e47a8e6dc9b8a622add625c73b05360a1b291134697`，515 个文件与打包时本地内容逐字节一致，且不含本机 AGENTS、凭据或运行目录。验收凭据及截图保存在本地 `.code_deploy/verification/`。

本轮生产 `npm ci` 完成，但安装日志的依赖审计报告 99 条告警（3 low、48 moderate、42 high、6 critical）；未在本轮自动升级依赖或验证各告警的生产可达性，不能把安装及功能回归通过等同于依赖审计整改完成。

2026-10-22 平台模型配置功能已上线：代码提交 `f9f0cb5`，execution `exec-37563ca724c6491e9c99`、revision `rev-54788ea227a0418ebb9b`，OOS 为 `Released`、执行为 `Success`。实际目录 `/opt/cothread/releases/20261022T110306Z`，systemd active，启动时间北京时间 19:04:28。临时端口探活通过且保留旧执行器锁，切换后正式执行器 ready、7 个执行槽；19:05 核对排队 0、运行 0。生产从 117 号迁移升级至 118 号，配置表已创建且初始 0 行，脱敏有效配置仍来自原服务器环境变量：老翁/小祥/子 Agent 均为 DeepSeek 地址及 `deepseek-flash`，老翁 medium、其余 low；密钥与环境文件未替换。后续在管理页首次保存才启用数据库配置。

本轮发布包 `cothread-release-20261022T110214Z.tgz` 的 SHA-256 为 `956b69cc556f0f844210ce0d9842525d7838554fe55fdcb5659e09c8c53af361`，519 个文件与打包时本地内容逐字节一致，无 AGENTS、凭据、运行目录或 Windows 客户端文件；线上 `platform-model-settings.js`、`model-config.js`、`agent.js`、118 号迁移及 `dist/index.html` 的 SHA-256 与本地一致。浏览器导航至带提交号的模型配置入口，未登录时正确展示登录页；实际引用 `index-CuJp67JR.js`、`index-CjxCJK9E.css`，与本地一致；公开健康接口 `status: ok`、`executor.ready: true`。无可用线上登录会话，未在本轮操作登录后的管理表单、保存真实供应商配置或发送测试消息。

本轮验证：352 项无数据库测试、构建、格式与各架构门禁通过，npm 10 生产安装计划预检通过；针对性数据库回归 33 项通过，提交前补充的模型配置与会话锁检查 9 项通过，关闭竞态的最终会话锁复跑 7 项通过，各组有重叠，不相加作为总数。独立测试库应用完整 118 条迁移；没有再次运行全量集成测试。本轮 `npm ci --omit=dev` 安装 2266 个包并仍报告上述 99 条依赖告警。脱敏验收凭据与截图保存在本地 `.code_deploy/verification/model-settings-20261022/`。

2026-10-23 第一次发布中止：当时 HEAD 为 `09e9141`，包 `cothread-release-20261022T185031Z.tgz` 的 SHA-256 为 `49151d5744bde0438a73ed1e558f4d6f98169b79d93dc47be1d2ba98530af679`。MCP 与本机 Tea SDK 在查询 ECS 和读取 OOS 应用时都收到 `SSLEOFError`，没有 execution，生产仍停在 `f9f0cb5`。这份包没有上传。

同日稍后 TLS 恢复，按当时 HEAD `ee8f41d` 重新打包并上线。该提交包含本机 Agent 窗口退出码，以及管理页把历史等级键显示为老翁、小祥、子 Agent；其后的文档提交不改变运行包。格式与架构门禁通过；360 项无数据库测试首轮 358 项通过，沙箱准入和后台命令两项在单独复跑时通过，未再跑全量集成测试。npm 10 生产安装计划预检通过。上线包 `cothread-release-20261023T000849Z.tgz` 的 SHA-256 为 `9cf23eeb585f169fd6684040629b32d923edf0e1ee26178d3988cb684868d763`。OOS 分组为 `Released`，execution `exec-7f97c4c9e3624ef1b957` 为 `Success`，revision `rev-8005e4bccaaf496d8875`。公开健康接口 `status: ok`，执行器 ready，锁获取时间为 UTC `2026-10-23T00:11:08.130Z`（北京时间 08:11:08），7 个执行槽。未登录首页正常，引用 `index-BFuw8kiw.js` 与 `index-CjxCJK9E.css`，与本地 `dist/index.html` 一致。没有登录后的业务验收，也没有在服务器上读取 `current` 符号链接。119 号迁移包含在该包中，发布脚本会在切换前应用未执行迁移；本轮没有单独查询生产迁移表，不能把进程健康写成已看见新列。

2026-10-23 下午第二次发布中止：代码提交 `0aa528d` 已推送。包 `cothread-release-20261023T060834Z.tgz` 的 SHA-256 为 `21b5fdb5bdff313b8284947b38274b6a211cb605e3ec8bcc097d8f1466119586`。`LOCAL_AnalyzeDeployStack` 识别为 npm/nodejs，Node 要求 `>=22.22.3`。curl 访问 OOS 与 ECS 均完成 TLS 校验并返回 HTTP 400。随后 MCP `OOS_GetDeployStatus` 两次、`OOS_CodeDeploy` 一次都在握手阶段收到 `SSLEOFError`：状态查询打到 OOS，CodeDeploy 打到 ECS 的实例查询。没有 execution，没有上传。公开健康接口仍为 ok，执行器 ready，锁获取时间仍是 UTC `2026-10-23T00:11:08.130Z`，说明本轮没有重启正式进程。首页资源仍是 `index-BFuw8kiw.js` 与 `index-CjxCJK9E.css`；这次前端源码未改，本地 `dist/index.html` 也是这两个文件，因此哈希一致不能证明新的服务端代码已上线。

这次发布前：格式与架构门禁通过。小祥参与相关 22 项在本机 `127.0.0.1:3307/cothread_test` 通过。360 项无数据库测试首轮 356 项通过；单独串行复跑后，沙箱准入通过，原生上下文压缩和模型路由仍因 `sdk-minimal` 初始化超时失败，超时命令的后代写入用例单独复跑仍失败。这些失败文件不在 `0aa528d` 中。npm 10 生产安装计划预检通过。没有再跑全量集成测试。

同日下午 TLS 恢复后，用上述同一包和原来的 `ecs-promote` 启停钩子上传成功，没有改成通用 `npm start`。OOS 分组为 `Released`，execution `exec-6035811341fb421d8396` 为 `Success`，revision `rev-6fcdbb4a6fa84757855e`，完成时间 UTC `2026-10-23T06:39:25Z`。只读命令看到 `current` 为 `/opt/cothread/releases/20261023T063607Z`，systemd 为 active，启动时间北京时间 14:37:36，Node 为 `v22.22.3`。公开健康接口 `status: ok`，执行器 ready，锁获取时间 UTC `2026-10-23T06:37:38.510Z`，7 个执行槽。线上 `agent-participation.js` 含固定提醒「需要麻烦你再@小祥，我才会真的开始。」。浏览器打开带提交号的首页，登录页正常；资源仍是 `index-BFuw8kiw.js` 与 `index-CjxCJK9E.css`，与本地 `dist/index.html` 一致。控制台有一条模块 MIME 报错，对应首页内联的 `data:application/octet-stream` 预加载，主脚本和样式都是 200；未登录时 `/api/me` 返回 401。没有登录后的业务验收，也没有查询生产迁移表。状态接口没有带回 `ecs-promote` 的标准输出，目录、进程和源码是另一次只读命令核对的。

2026-10-25 发布，一次上线：代码提交 `09d3348`（已推送，远端 HEAD 一致），本轮改动 294 个文件。发布前门禁：`npm run lint` exit 0；`npm run test:unit` 403/403；全量 `npm test` 867 项中 866 通过、0 断言失败、1 项 `executor-lock-loss` 因自带 15 s 超时被 cancelled（单文件串行复跑 2 次均 3/3 通过，判定为负载相关偶发）；`npm run build` exit 0。全量测试结束后又修了 `web/miniprogram.css`、`web/theme-overrides.css`、`web/workspace.css` 的悬空选择器、多余分号与漏 `@`（esbuild 只告警、构建仍 exit 0），修复后重建为 0 条 CSS 告警；CSS 不在测试覆盖内，重建即该修复的验证。包 `cothread-release-20261025T125206Z.tgz`，SHA-256 `4d4e22f964dafbe6cecd8af5911247a0ce421e49a53ea2d3eb1349601dba969c`，6,016,029 字节；包内不含 `AGENTS.md`、`.env`、`.local`、`.code_deploy`。`OOS_CodeDeploy` 一次受理成功（HTTP 200，RequestId `01A1731E-938D-5FE1-843A-7FC23BAF147F`），沿用 `ecs-promote` 启停钩子，未改用通用 `npm start`。

线上只读核对：`current` 为 `/opt/cothread/releases/20261025T125244Z`，systemd active，启动时间北京时间 20:54:22，MainPID 196297；`/opt/cothread/releases` 保留 3 个目录；`current/.env`、`current/.local` 均为共享链接。启动日志显示迁移 125–144 全部应用（含同日两个 `144_` 前缀文件）后输出「共序已启动」，探活进程 pid 196270 在切换前退出。健康接口 `status: ok`、执行器 ready、锁获取 UTC `2026-10-25T12:54:24.341Z`、6 个执行槽。首页引用 `index-BrzSoBy6.js`（243,997 字节）与 `index-CDMW7e8e.css`（145,448 字节），与本地 `dist` 一致；公网 `https://cothread.z2l.top/api/health` 与首页均 200。浏览器实机：登录页正常渲染、背景 `rgb(248, 250, 248)`、主脚本与样式 MIME 正确、控制台无 vite 错误覆盖层。

本轮未完成与已知问题：没有登录后的业务验收，也没有查生产迁移表；`OOS_GetDeployStatus` 这次只回历史 revision 列表，未取到本轮 execution/revision 号，下一轮应同时记录 RequestId 并在控制台核对 OOS 执行记录。控制台仍有一条 `modulepreload` 指向 `data:application/octet-stream` 的 MIME 报错（未登录时另有 `/api/me` 401）；上一版与上上版 release 的 `dist/index.html` 同样存在，非本轮引入，主脚本与样式不受影响，后续可把内联启动模块改成 `data:text/javascript;base64` 或去掉该 modulepreload 消除。

### 发布前测试中暴露的配置问题

- `sandbox_runs` 的 `runs_side_*` 触发器会更新 `threads.side_revision`，因此同一条 `UPDATE sandbox_runs JOIN threads` 或删除沙箱记录时引用 `threads`，会触发 MySQL `ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG`。已确认症状包括命令结束状态不能落库、随后的归档返回 409，以及集成清理钩子失败后连接未释放。`finishSandboxRun` 和启动中断清理改为同一事务内分开更新沙箱记录和活跃时间；已有事务连接使用保存点，第二次写入失败且调用方捕获错误时也不能提交半条完成记录。中断清理先锁定本次运行记录，活跃时间取这些记录的 `finished_at` 并保持单调；归档冻结语句不变。测试清理先查询迭代 ID，再删除沙箱记录，并在 `finally` 释放数据库。不要改写 113/114 等已应用迁移来绕过冲突。
- 纯前端小程序的 Dimina 运行配置允许 `cloudbase: null`。预览元信息读取需同时保护 `runtimeConfig` 和 `cloudbase`，返回 `envId: null`；不能因缺少云环境而抛空值异常。Admin 预览和静态托管仍要求 CloudBase 开发环境。
- 全量测试需同步当前接口和配置契约：本地执行器请求使用 `/local-executor/` 和 `/local-executor-tasks/`；114 号迁移已将旧 `connector_tasks` 更名，历史作者修复逻辑的测试需要映射到当前表名，但历史迁移文件不变。`enabled` 由 AppID 派生，不能再用 `enabled: false` 夹具代表未配置；先保存 AppID，再测试云环境、托管路径或运行时密钥读取。CloudBase 密钥对必须完整保存，缺失凭据的发布历史用例应构造真正无凭据场景；管理客户端缓存计数须排除保存凭据时的环境校验调用。公开认证配置新增字段、代码上传密钥文案变更也需同步断言，不能放宽生产校验让旧断言通过。

- 小程序模式在运行时代码中已存在，`shared/dialogue-mode.d.ts` 却未声明 `miniprogram`；Admin 启动回调还漏了实际使用的 `force` 参数。先以 `tsc` 结果校验声明和调用契约，再打包。
- VM 测试转换 `server/local-sandbox.js` 后，`./executor-fence.js` 必须相对生产模块解析，使用 `createRequire(new URL("../server/local-sandbox.js", import.meta.url))`；相对测试文件解析会报模块不存在。格式化导致的换行变化，应修正测试的空白匹配，不改变生产行为。
- 首次保存 CloudBase 配置时，不能先加载尚不存在的完整运行时配置；已有凭据配置好后才核对环境与 AppID 的归属。凭据保存将 SecretId 留在提示字段、SecretKey 加密存储，调用凭据校验前必须重新拼回完整凭据，不能拿仅含 SecretKey 的存储载荷去校验。实现见[小程序配置](../../server/miniprogram-config.js)。
- CloudBase SDK 工厂按项目环境缓存，不能断言每个操作都新建实例。本次凭据注入测试覆盖的调用应复用 1 个数据面客户端，管理操作复用 manager、账号环境枚举单独创建，共 2 个 manager；见[凭据回归测试](../../tests/cloudbase-tool-credentials.test.js)。

- 2026-10-25 预发布测试暴露并已修复的源码缺陷（不是测试过期；修复后按文件单独复跑，再跑一次全量）：
  - `server/mcp.js` 的 `get_connection_guide` 处理器引用了只在 `createMcpServer` 作用域声明的 `instructions`，调用时抛 ReferenceError 并返回 `isError`，连带 3 个 MCP 用例失败；改为 `mcpInstructionsForSource(user.mcpSource)`。
  - `publish_artifact` 在没有 caller session 时不识别仍在运行的子 Agent，父回复结束后子 Agent 提交被 409「Agent 任务已停止」拒绝；`agent-tools` 需用 `liveChildAgentRun` 解析 `executorSessionId`。
  - `classifyTaskFailure` 首行 `status === "blocked"` 短路，而 settle 已把失败收敛成 blocked，导致 `platform_blocked` 永不生效、平台错误被误判可自动重试；分类必须传原始失败来源，显式报 blocked 时仍短路。
  - `saveMemberUnderstandings` 只在 upsert 里比较 `through_sequence`，但发言记忆页已先写入 wiki，再按「wiki 是事实」回写旧摘要缓存，过期摘要仍会覆盖新摘要；应在入口按 through_sequence 整批跳过。
- 2026-10-25 前端检查项：`web/workspace.css` 在 2026-10-24 截断恢复后混入 79 处与 `overlays.css` 同值的 `--overlay-*` 定义，以及 85 处缺 `@` 的 `media (...)` / `supports (...)`；后者让新增响应式规则全部失效。整条规则删除时必须连选择器头一起删，否则留下悬空 `:is(`，PostCSS 报 `Unclosed bracket`，dev 与 `vite build` 同时失败；本次两处悬空头就是这样暴露的。同类笔误还有选择器尾部多余分号（`theme-overrides.css` 与 `workspace.css` 的 `:is(... button.danger;)`）和 `supports not (...)` 漏 `@`，esbuild 只报 `Unexpected ";"`/`Unexpected "("` 警告、构建仍 exit 0，必须看构建日志而不是只看退出码。`npm run lint` 不解析 CSS 括号，删除后必须再用 `postcss.parse`（或直接 `npm run build`）验证，并在浏览器按 1600/1000/700/640 宽度核对：本次实测侧栏 255/210，模型设置 640 时单列。
- 2026-10-25 新增页面直接写原生 `input/select/textarea` 会被 `check-field-usage` 拦下；改走 `TextField/TextAreaField/SelectField`，紧凑高度用 `flush/dense` 加作用域变量，不要登记白名单绕过。主题产物过期用 `npm run theme:fallback` 重新生成。
- 2026-10-25 全量测试 83 分钟的根因与修复：`tests/database.js` 原来逐表 `TRUNCATE` 重置（104 张表，每张表多次 fsync）。全量套件共 222 次重置，磁盘压力大时单次从 4 s 恶化到 21 s，实测每次重置约 8,000 次同步落盘，占总时长约 94%。改为单事务 `DELETE`（`FOREIGN_KEY_CHECKS=0` 下 102 张表，提交后一次 `ALTER TABLE users AUTO_INCREMENT`）：同压力下单次 20.5 s → 1.6 s、fsync 3,775 → 68；全量 83.3 → 15.5 分钟，15–30 s 区间的用例从 162 项降到 1 项。注意 `DELETE` 不复位其他表的自增（`TRUNCATE` 会），测试不应依赖它们从 1 开始；`ip_geolocations` 与 `schema_migrations` 仍跳过。曾尝试进程内共享连接池把 222 次压到每文件一次，但池的 socket 持有事件循环、`beforeExit` 不触发，会让 `node --test` 子进程挂死，已放弃；要再减少重置次数只能把具体文件改成显式 `before/after`。本机测试实例另可设 `innodb_flush_log_at_trx_commit=2`、`sync_binlog=0` 继续降 fsync（只对测试实例，不改生产）。
- 2026-10-25 并行分片：`scripts/test-shards.mjs`（`npm run test:shards`）按「导入 `tests/database.js` 的文件」分到各自测试库，其余无库文件单独一路并发跑；仍要求 `TEST_DATABASE_HOST_PUBLIC=<host:port>/<db>` 与 `TEST_DATABASE_AUTH`，没有 `TEST_SHARD_DATABASES` 时只用当前库（于是得到 2 路）。默认会自动发现本机 `cothread_test`、`cothread_test_2`… 这些库并全部用上（只认这个前缀，不动 `cothread_prompt_test` 等独立库），也可用 `TEST_SHARD_DATABASES` 显式指定。本机已建 `cothread_test_2`…`cothread_test_5`：`cothread` 账号没有全局 `CREATE`，是用 root（`.local/mysql-client.ini`）执行 `CREATE DATABASE` + `GRANT ALL PRIVILEGES ON `cothread_test_N`.* TO 'cothread'@'127.0.0.1'` 建的；再要加库沿用同样方式。并行分片实测 6 路 **69 秒**跑完 867 项（403+464），迁移锁已按库名隔离，同库仍串行。正式发布证据仍以串行 `npm test` 为准，并行用于本地快速反馈。
- 2026-10-25 契约同步项（改测试期望即可，不放宽断言）：MCP 工具清单新增 `search_memory`；任务失败态收敛为 `blocked`，执行轮次仍记 `failed`；事件用量新增 `cacheReadTokens`；项目页签 `open` 改为 `COALESCE`，重开保持原位。
- 2026-10-25 时间与批量：全量 867 项，同一棵树改前 83.3 分钟；快速重置后 `npm test` 串行 15.5 分钟，`npm run test:shards` 并行 **4.2 分钟**（94 个带库文件 + 87 个无库文件两路，403+464 全过）。失败明细在套件结束才输出，中途只能看日志增量。lint 的 Prettier 只检查改动集，改动多时先对全部改动文件 `prettier --write`（本次 243 个文件）；`--env-file-if-exists=.env` 必须带上，否则会出现「Model is not configured」假失败。

本地 `.env` 仅保留 `.env.example` 中列出的必要项。监听 `0.0.0.0:3100`、站点 `https://cothread.z2l.top`、HTTPS 时 Secure Cookie 已在代码写死，不必再配。

任务在 `.local/sandboxes` 中执行。数据库模型配置默认由老翁、小祥与实际子 Agent 派活共用，可单独覆盖 老翁。仅在没有数据库配置时，`KNOWLEDGE_MODEL_*` 用于老翁知识整理，`MODEL_*` 作为 小祥调度和实际 子 Agent 派活的共享基线。旧的 `COORDINATOR_MODEL_*` / `EXECUTOR_MODEL_*` 仅作为迁移兼容变量；环境变量模型字段可写成 `模型名@推理强度`，省略推理强度时基线默认使用 `low`。推理强度可取 `off`、`none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra`；管理页用独立选项设置推理强度。

模型调用统一使用 OpenAI Responses API。各套 `*_MODEL_BASE_URL` 是服务商提供的 API 基础地址，程序不会擅自补 `/v1`；Responses 适配器只在该地址后追加 `/responses`。命令以应用进程的操作系统账号在 `.local/sandboxes` 中执行，不具备容器级隔离；生产环境只有这一条执行路径。

本地首次账号由 `npm run setup` 生成至 `.local/initial-admin.json`，不进入版本库；`npm run db:seed` 读取它完成数据库账号初始化。之后每次 `npm run dev` 启动都会把本机超级管理员密码重置为固定值 **`cothread-dev`**（需要临时换口令时设 `DEV_ADMIN_PASSWORD`），写入 `.local/initial-admin.json` 与登录备忘；该重置只在 `COTHREAD_DB_TARGET=dev` 且数据库在本机时执行，生产初始化仍走 `ADMIN_PASSWORD`（至少 12 位）。ECS 空库可临时设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 完成初始化，已有账号只依赖数据库。

2026-10-25 本轮发布尝试：提交 `a8b1804` 已推送；串行全量测试 `npm test` 在本机独立测试库 `127.0.0.1:3307/cothread_test` 上 867/867 通过，`npm run lint` 与 `npm run build` 通过。打包产物 `cothread-release-20261025T153518Z.tgz`，SHA-256 为 `3792537080173787BB834F566337C5D07D0DA15BC35ADF05554F390E649E0F5B`。随后两次 `OOS_CodeDeploy` 均在调用 `ecs.cn-hangzhou.aliyuncs.com` 时收到 `SSLEOFError`，`OOS_GetLastDeploymentInfo` 仍为上一轮 20:52 部署，没有本轮 execution、上传或线上切换；本轮发布失败，待阿里云 MCP/网络握手恢复后从同一清单重试。

2026-10-26 重试发布成功：基于 HEAD `5f2bf48` 重新打包为 `cothread-release-20251025T171951Z.tgz`，SHA-256 为 `267734BB30C12F9B2FDAD3C74204179A1ABDF0EDB427665DD2CD9BF3CC69BA80`。`OOS_CodeDeploy` 返回 HTTP 200，RequestId `01A17413-9F9A-5E00-B4B0-FC20A3654397`，execution `exec-c20864df889c4245affa`，revision `rev-711046387c8e4ec18f16`；随后 `OOS_GetLastDeploymentInfo` 更新为北京时间 2026-10-26 01:20:03。公网 `/api/health?release=5f2bf48` 返回 200，`status: ok`、数据库可读、`executor.ready: true`、6 个执行槽，`acquiredAt` 为 UTC `2026-10-25T17:21:50.949Z`；首页 200，资源为 `index-J2fKTV83.js` 与 `index-CDMWY8e8.css`。OOS 状态查询在完成后再次出现 `SSLEOFError`，但不影响上述 execution、last-deployment、健康接口和资源验收证据。
