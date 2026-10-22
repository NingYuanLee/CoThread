# 云端环境变量

维护约定：每次发布都应核查并更新本文，删去失效或过时步骤，将新问题及已验证的处理办法合并到相应章节。发布失败或中止也要记录确认的问题与遗留事项。最近流程核查：2026-10-22；已核对现有构建、打包、启动及停止钩子，发布结果见下方验收记录。

应用后端需要常驻 Node.js 进程（Node.js 22.22.3+，推荐 24）、MySQL 网络连接及可写的 `.local` 目录。只发布 `dist/` 静态文件无法运行 API、MCP 和后台 Agent；生产环境固定为阿里云 ECS 单实例 + RDS，本机开发用便携版 MySQL。

在 ECS 上把变量配置到后端运行环境（`/opt/cothread/.env`）。无需上传真实 `.env`；`npm start`、`npm run db:migrate`、`npm run db:seed` 和 `npm run db:backup` 允许该文件不存在。本地存在 `.env` 时仍会读取，环境里已设置的同名变量优先。

| 变量 | 配置 |
| --- | --- |
| `DATABASE_HOST_INTERNAL` / `DATABASE_HOST_PUBLIC` | 正式库内网 / 外网地址，格式 `host:port/dbname`；运行时自动选：阿里云 ECS 用内网，本机用外网 |
| `DATABASE_ENDPOINT` | 可选强制 `public` 或 `internal`；不设则按主机类型自动判断 |
| `DATABASE_AUTH` | 正式库账号密码，合写为 `user:password`（仅按第一个冒号拆分） |
| `TEST_DATABASE_HOST_INTERNAL` / `TEST_DATABASE_HOST_PUBLIC` | 测试库内网 / 外网地址，格式 `host:port/dbname` |
| `TEST_DATABASE_AUTH` | 测试库 `user:password`；`npm test` 会整库清表，勿指向正式库名 |
| `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL` | L2 调度与 L3 派活共用的默认模型：OpenAI Responses 兼容接口根地址、密钥、`模型名` 或 `模型名@推理强度` |
| `KNOWLEDGE_MODEL_BASE_URL` / `KNOWLEDGE_MODEL_API_KEY` / `KNOWLEDGE_MODEL` | 可选的 L1 知识整理模型覆盖；未设置时继承 `MODEL_*` |
| `CREDENTIAL_ENCRYPTION_KEY` | 固定的 32 字节随机密钥，使用 base64 编码；跨重部署保持一致 |
| `ADMIN_EMAIL`、`ADMIN_PASSWORD` | 空库初始化账号时使用；密码至少 12 位，不能为 `CHANGE_ME` |
| `SMTP_URL` | SMTP 连接地址，例如 `smtps://账号:授权码@服务器:465`；账号和授权码中的特殊字符需 URL 编码 |
| `EMAIL_FROM` | 系统邮件显示的发件人名称和地址 |
| `MEMORY_MAINTENANCE_TOKEN` | 定时维护专用令牌（`POST /api/memory-maintenance`），属于敏感信息 |

`CREDENTIAL_ENCRYPTION_KEY` 与 `MEMORY_MAINTENANCE_TOKEN` 须人工配置并长期固定；`npm run setup` 不会生成它们。迁移已有部署时保留原有令牌加密密钥（环境变量，或将已有 `.local/credential-encryption.key` 的 32 字节二进制内容编码为 base64），否则无法解密原来的账号令牌。不要提交密钥；也不要在运行时自动新建密钥文件。

### 模型配置同步与上游故障检查

代码发布不会同步本机 `.env`：发布包排除该文件，release 的 `.env` 始终链接 `/opt/cothread/.env`。修改本机模型地址、密钥或模型名后，必须单独核对服务器的有效配置；不要以本机配置一致推断生产一致。`MODEL_*` 优先供 L2/L3 共用，未配置时各自回退旧 `COORDINATOR_MODEL_*` / `EXECUTOR_MODEL_*`；L1 只在未填写 `KNOWLEDGE_MODEL_*` 时继承 `MODEL_*`，不会继续继承旧 coordinator 配置。因此只有旧变量的环境不能直接删除 L1 覆盖。迁移时先补齐完整 `MODEL_*` 三项，再按需保留完整 L1 覆盖，并清理旧变量以避免误判。

2026-10-22 成员认识整理故障已核实：本机三层使用相同 DeepSeek 地址、模型和密钥，但 ECS 仍保留旧变量，L1/L3 指向另一兼容网关。项目维护日志中上下文准备和 DSH 启动成功，模型执行连续返回 503；从同一 ECS 对 L1 专用 Responses 接口做最小请求，得到 502 `Upstream authentication failed`，默认 coordinator 路由同类请求返回 200。该证据确认旧专用上游鉴权链路存在故障，未确认网关内部具体哪项凭据失效。

恢复时先确认本机执行器没有运行或排队任务，备份服务器原配置（仅在服务器保留且限制权限），只同步模型相关变量，保留数据库、加密密钥和其他配置，然后重启 systemd 服务。凭据应通过安全传输或加密载荷传送，不能放入发布包、命令日志或诊断输出。若新配置无法启动或模型校验失败，恢复本轮备份并重启；服务健康只证明进程和数据库恢复，还须验证真实整理任务。

本轮曾尝试仅删除 L1 覆盖，因服务器缺少完整 `MODEL_*` 基线而未通过模型配置校验，已立即恢复原配置；随后按本机配置同步完整基线及 L1 覆盖。最终服务 active、健康接口 ok、执行器 ready；项目 `aab430a9-52af-463f-b0de-543efea6f40a` 的成员整理 run `536dbdb4-e750-49dd-ab22-99c9b914fda6` 于北京时间 15:54:45 完成，处理 2 项且 error 为空。此次为生产配置修复，无代码包发布或数据库迁移；不代表其他项目和全部业务已验收。

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
6. 远端测试库出现 `PROTOCOL_CONNECTION_LOST` 时，先区分连接故障与业务断言失败。可使用本机已安装的 MySQL 和专用测试库（本次为 `127.0.0.1:3307/cothread_deploy_test`），仅向测试子进程注入 `TEST_DATABASE_HOST_PUBLIC`、`TEST_DATABASE_AUTH`。凭据从现有本地配置读取，不打印、不提交；`npm test` 会清空目标测试库，不能指向生产或日常开发库。
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

| 现象 | 本次确认的原因 | 下次处理方式 |
| --- | --- | --- |
| `Released`，但页面资源及 `current` 仍是旧版本 | 停止钩子的 `exit 0` 终止了拼接后的整个脚本 | 先看 `deployCurrentRevision` 输出及组合命令，检查停止钩子，避免反复上传同一包 |
| `npm ci` 报 `EUSAGE`，锁文件中 `postcss-selector-parser@7.1.6` 不满足 `7.1.7` | 已有本地依赖掩盖锁文件不一致 | 本地同步锁文件并做生产安装预检，提交、推送、重打包后重试 |
| `EBADENGINE` | ECS Node 低于编译器要求 | 核对版本检查及独立运行时安装结果，验证新 Node 后再切换 |
| `ReleaseWaiting`，新发布报 `DeployFailed.ApplicationGroup` | 上一轮执行因 `FailurePause` 停在失败处 | 先读取失败子任务，修复原因，再取消那一条已确认失败的 execution，之后重新调用 CodeDeploy；不删除应用分组、不新建 ECS |
| 临时探活报 `EXECUTOR_ALREADY_RUNNING`，随后 `ReleaseWaiting` | 2026-10-22 临时生产进程也启动了 worker，与正式进程争抢 `cothread-executor` 锁 | 使用 `--health-probe`，同时跳过启动/退出的预览及沙箱清理；不能靠提前停止正式服务来让探活抢锁。已新增真实子进程回归，验证已有执行器锁与运行记录在探活启动、健康读取和正常退出后均保持不变 |
| 发布停留在 `Releasing` | 可能仍在下载和安装依赖 | 看安装进度及子任务状态；本次安装 2265 个包约用 2 分钟，包含下载重试。日志仍在推进时不要重复部署 |
| Alibaba `LOCAL_RunShellScript` 一直无结果 | 本次分别达到 30 秒、120 秒超时 | 说明已试路径；必要时用本机已安装的 Alibaba SDK 和既有环境凭据读取 OOS/ECS 诊断信息。不要把 AK/SK、临时签名 OSS URL 写入文档或日志；发布入口仍用 MCP CodeDeploy |

定位执行问题时，从本次父 execution 的部署任务进入实例子执行，再读取 `deployCurrentRevision` 的状态、输出和实际命令。本次层级为 `<execution>.t0005.i0001`；任务名称和层级应按实际返回发现，不把后缀当作永久 API 契约。应用分组摘要不足以说明启动命令是否真正运行。

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

### 发布前测试中暴露的配置问题

- `sandbox_runs` 的 `runs_side_*` 触发器会更新 `threads.side_revision`，因此同一条 `UPDATE sandbox_runs JOIN threads` 或删除沙箱记录时引用 `threads`，会触发 MySQL `ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG`。已确认症状包括命令结束状态不能落库、随后的归档返回 409，以及集成清理钩子失败后连接未释放。`finishSandboxRun` 和启动中断清理改为同一事务内分开更新沙箱记录和活跃时间；已有事务连接使用保存点，第二次写入失败且调用方捕获错误时也不能提交半条完成记录。中断清理先锁定本次运行记录，活跃时间取这些记录的 `finished_at` 并保持单调；归档冻结语句不变。测试清理先查询迭代 ID，再删除沙箱记录，并在 `finally` 释放数据库。不要改写 113/114 等已应用迁移来绕过冲突。
- 纯前端小程序的 Dimina 运行配置允许 `cloudbase: null`。预览元信息读取需同时保护 `runtimeConfig` 和 `cloudbase`，返回 `envId: null`；不能因缺少云环境而抛空值异常。Admin 预览和静态托管仍要求 CloudBase 开发环境。
- 全量测试需同步当前接口和配置契约：本地执行器请求使用 `/local-executor/` 和 `/local-executor-tasks/`；114 号迁移已将旧 `connector_tasks` 更名，历史作者修复逻辑的测试需要映射到当前表名，但历史迁移文件不变。`enabled` 由 AppID 派生，不能再用 `enabled: false` 夹具代表未配置；先保存 AppID，再测试云环境、托管路径或运行时密钥读取。CloudBase 密钥对必须完整保存，缺失凭据的发布历史用例应构造真正无凭据场景；管理客户端缓存计数须排除保存凭据时的环境校验调用。公开认证配置新增字段、代码上传密钥文案变更也需同步断言，不能放宽生产校验让旧断言通过。

- 小程序模式在运行时代码中已存在，`shared/dialogue-mode.d.ts` 却未声明 `miniprogram`；Admin 启动回调还漏了实际使用的 `force` 参数。先以 `tsc` 结果校验声明和调用契约，再打包。
- VM 测试转换 `server/local-sandbox.js` 后，`./executor-fence.js` 必须相对生产模块解析，使用 `createRequire(new URL("../server/local-sandbox.js", import.meta.url))`；相对测试文件解析会报模块不存在。格式化导致的换行变化，应修正测试的空白匹配，不改变生产行为。
- 首次保存 CloudBase 配置时，不能先加载尚不存在的完整运行时配置；已有凭据配置好后才核对环境与 AppID 的归属。凭据保存将 SecretId 留在提示字段、SecretKey 加密存储，调用凭据校验前必须重新拼回完整凭据，不能拿仅含 SecretKey 的存储载荷去校验。实现见[小程序配置](../../server/miniprogram-config.js)。
- CloudBase SDK 工厂按项目环境缓存，不能断言每个操作都新建实例。本次凭据注入测试覆盖的调用应复用 1 个数据面客户端，管理操作复用 manager、账号环境枚举单独创建，共 2 个 manager；见[凭据回归测试](../../tests/cloudbase-tool-credentials.test.js)。

本地 `.env` 仅保留 `.env.example` 中列出的必要项。监听 `0.0.0.0:3100`、站点 `https://cothread.z2l.top`、HTTPS 时 Secure Cookie 已在代码写死，不必再配。

任务在 `.local/sandboxes` 中执行。生产推理有两路：`KNOWLEDGE_MODEL_*` 用于 L1 知识整理，`MODEL_*` 作为 L2 调度和实际 L3 派活的共享基线。旧的 `COORDINATOR_MODEL_*` / `EXECUTOR_MODEL_*` 仅作为迁移兼容变量；模型字段可写成 `模型名@推理强度`，省略推理强度时基线默认使用 `low`。推理强度可取 `off`、`none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`ultra`。

模型调用统一使用 OpenAI Responses API。各套 `*_MODEL_BASE_URL` 是服务商提供的 API 基础地址，程序不会擅自补 `/v1`；Responses 适配器只在该地址后追加 `/responses`。命令以应用进程的操作系统账号在 `.local/sandboxes` 中执行，不具备容器级隔离；生产环境只有这一条执行路径。

本地首次账号由 `npm run setup` 生成至 `.local/initial-admin.json`，不进入版本库；`npm run db:seed` 读取它完成数据库账号初始化。ECS 空库可临时设置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 完成初始化，已有账号只依赖数据库。
