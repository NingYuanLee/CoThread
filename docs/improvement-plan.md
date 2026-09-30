# 共序 CoThread 最终改动清单

> 版本 v1.2 · 2026-09-29 · 依据：三轮交叉评估（DeepSeek / workbuddy / GPT-6）+ 本机实测
> 原则：只列"明显该改且已核实"的项；每条给出位置、现状证据、改法与验收标准。
> 计数约定：行数 = **总行数（含空行）**；hook 数 = **调用点计数（不含 import）**。v1.0/v1.1 的行数用的是"非空行"，已修正。

## 0. 结论

功能密度已经足够，欠账集中在**工程化**与**配置边界**，不在功能本身。密码哈希、令牌、加密、SQL 参数化这些原语不动；要改的是"默认目标"和"危险操作的权限边界"。

## 1. 已确认事实（证据基础）

| # | 事实 | 证据 |
|---|---|---|
| 1 | `npm run db:backup` 现在直接崩溃 | 实测 `TypeError [ERR_INVALID_URL] at scripts/backup.js:6` |
| 2 | 本机 `.env` 指向活的正式库（非占位） | 只读探针：`connected=true, schema_migrations=87, users=10, projects=11, db=cothread` |
| 3 | 开发模式回显邮箱验证码且监听 0.0.0.0 | `server/http-app.js:145-150` + `server/runtime-config.js:3` |
| 4 | 便携 MySQL 自动启动在新配置下失效 | 只设 `DATABASE_HOST_INTERNAL=127.0.0.1:3307/...` 时 `isPortableLocalMysql()` = false，仅旧的 `DATABASE_URL` 写法为 true |
| 5 | 17 处裸 `createDatabase()` 默认走正式库 | 16 个 `scripts/*` + `server/makers.js:17` |
| 6 | 测试可分两层：78 个测试文件中 40 个不依赖数据库 | 6 个纯单测 111 ms 全绿；含 DB 的 6 个文件跑 30 分钟未结束（进程 CPU 累计约 3 s） |
| 7 | 无任何 CI / lint 配置 | 无 `.github`；`eslint` 0 命中；`prettier` 只有依赖声明，无配置无脚本 |
| 8 | 前端巨型文件且零 memo 化 | `web/Documents.tsx` **4652 行 / 72 个 `useState` 调用点 / 0 `useMemo`、0 `useCallback`**；`web/WorkspaceApp.tsx` **2934 行 / 68 / 0 `useMemo`、2 `useCallback`** |
| 9 | CSS 令牌被字面量抄了两遍 | `web/style.css` 中 1405 处 `var(--c-XXXXXX, #XXXXXX)` |
| 10 | CSS 重复规则 | 2123 条顶层规则 / 1867 个唯一选择器 → 182 个选择器重复出现（共 256 次） |
| 11 | 跨文件重复代码 | 56 个 10 行窗口逐字重复；首位是 `Documents.tsx ↔ WorkspaceApp.tsx`（30 个） |
| 12 | 环境变量漂移 | 代码引用 40 个 / `.env.example` 列出 19 个 |
| 13 | 迁移幂等性偏弱 | 87 个迁移仅 23 个含 `IF NOT EXISTS`；无 checksum、无 down |
| 14 | 构建健康 | `tsc --noEmit` 0 错；`vite build` 通过（本机约 25 s） |
| 15 | **shell 环境变量优先于 `.env`** | 实测 `--env-file` 不覆盖已存在的环境变量：进程内 `EMAIL_FROM=SHELL_VALUE` 胜出，文件值仅在未设置时生效 |

## 2. 决策前提

三条初衷成立，方案必须兼容：

1. 验证阶段要本地连正式库排查问题 → **保留能力**，但必须显式开启，且该会话默认禁用 worker 与自动迁移。
2. 测试库放云端用于部署前验证 → **保留**；但日常迭代与 CI 用本地容器库（公网 RDS 上"每次清库 + 重放 87 个迁移"是主要耗时来源）。
3. 三套配置集中在一个 `.env` → **保留集中**；改的是"默认目标"与"操作权限边界"。

设计约束（与现有部署契约兼容）：

- 不改名 `DATABASE_HOST_*` / `TEST_DATABASE_HOST_*`：已是 Makers 控制台与 ECS 现网变量名。
- 不新增易与 `DATABASE_ENDPOINT`（public|internal，网络路径）混淆的名字；新变量统一 `COTHREAD_*` 前缀。
- `--production` 进程零配置变更，行为保持一致。
- 目标可被**命令级覆盖**（事实 15），因此 `.env` 里写什么都不会锁死单次命令；代价是 shell 里残留的变量也会 silently 生效，所以启动横幅必须打印"生效目标 + 来源"。

## 3. 改动清单

### A 配置与目标选择（P0）

**A1 新增"目标选择"层**

新增变量：

- `COTHREAD_DB_TARGET=dev|test|prod`（唯一必填项）
- `DEV_DATABASE_HOST` / `DEV_DATABASE_AUTH`（新增 dev 组，默认 `127.0.0.1:3307/cothread_dev`）
- `COTHREAD_ALLOW_REMOTE_DB`（沿用已有变量：是否允许连远程库）
- `COTHREAD_ALLOW_PROD_WRITE=1`（是否允许**写**生产目标，见 A2b）
- `COTHREAD_WORKER=0|1`（是否启动常驻 worker / 定时扫描）

逐命令默认目标：

| 入口 | 默认 target | 说明 |
|---|---|---|
| `npm start` / `--production`（ECS、Makers） | `prod` | 现网行为不变，平台变量一个都不用改 |
| `npm run dev` | `dev` | **行为变更点**：今天它走 `DATABASE_HOST_*`（= prod） |
| `npm test` | `test`（强制） | 在 `tests/database.js` 落实，不依赖 `db.js` 默认解析（见 A2） |
| 裸 `node scripts/*.js` | 无默认 | 未设即报错并打印设置指引 |

命令级覆盖（无需改代码，已实测可行）：

```powershell
$env:COTHREAD_DB_TARGET="prod"; npm run dev     # 本次会话连正式库排查
$env:COTHREAD_DB_TARGET="test"; npm run dev
```

启动横幅（A4）打印：`目标=prod(来源:shell) · 库=cothread · 迁移=跳过 · worker=关闭 · 写权限=否`。

**A2 三个解析函数 + 统一分派**

```js
resolveConfiguredDatabaseUrl()          // prod 组：DATABASE_HOST_* + DATABASE_AUTH（已存在）
resolveConfiguredTestDatabaseUrl()      // test 组：TEST_DATABASE_HOST_* + TEST_DATABASE_AUTH（已存在）
resolveConfiguredDevDatabaseUrl()       // dev 组：DEV_DATABASE_HOST + DEV_DATABASE_AUTH（新增）
resolveTargetDatabaseUrl(target, env)   // 按 target 统一分派（新增）
```

- `server/db.js:14` 默认参数改为 `resolveTargetDatabaseUrl(requireExplicitTarget())`：只解析目标，无目标即报错；**不因目标是 prod 而拒绝连接**（否则误伤只读排查脚本）。
- `scripts/ensure-local-mysql.js:8` 必须改用 dev 解析器 —— 它今天读 `process.env.DATABASE_URL`，既不是 prod 也不是 dev。
- `npm test` 的强制 test **在测试入口落实**：`tests/database.js` 今天直接用 `resolveConfiguredTestDatabaseUrl()`，完全不看 `COTHREAD_DB_TARGET`；补一条断言，`COTHREAD_DB_TARGET=prod` 时直接失败。
- `server/makers.js:17` 改为显式 `resolveTargetDatabaseUrl("prod")`（**本批唯一线上风险点**）。

**A2b 写操作闸门（放在真正发生写入的地方）**

新增 `assertWriteAllowed(policy, env)`：

- `--production` 进程 → 允许；
- `target=prod` 且非生产进程 → 需 `COTHREAD_ALLOW_PROD_WRITE=1`；
- `target=dev|test` → 允许。

套用位置：

- **自动写入**：`server/index.js:40`（`migrate`）、`server/index.js:124`（`startReplyWorker`）、`server/makers.js:19`（`migrate` + `seedAdmin`）；
- **显式写脚本**：`scripts/demo.js`、`seed.js`、`migrate.js`、`import-ip-geolocations.js`、`repair-preview-test-pptx.mjs`、`compress-avatars.mjs`、`seed-document-preview-fixtures.mjs`、`restore-check.js`（建/删临时库）、`mysql-bootstrap.js`（建库、建用户、改权限）；
- **已核实为写脚本，必须加闸门**：`agent-smoke.js`（4 处写 SQL + `Service`）、`test-html-bundle.mjs`（**真的 INSERT 进 `versions` / `artifacts`**，v1.1 曾把它误列为只读）、`restore-check.js`（CREATE / DROP 临时库）、`mysql-bootstrap.js`（CREATE DATABASE / CREATE USER / GRANT）。
- **待确认（看它调用的 `Service` 方法是否写库）**：`summary-check.js`（使用了 `Service`）、`agent-recovery-check.js`（无裸 SQL 写、无 `Service`）。
- **已核实为真只读，不加闸门**：`verify-html-bytes.mjs`、`compare-html-preview.mjs`、`html-preview-diff.mjs`、`audit-html-assets.mjs`。

**判断依据不看文件名**：检查脚本是否调用 `Service` 的写方法，或直接执行 `INSERT/UPDATE/DELETE/DDL`。两个坑：① 用正则扫 SQL 写语句时，`String.replace(` 会被 `REPLACE` 误命中（上面四个只读脚本第一轮的"写 SQL"命中全部是 `.replace()` 误报）；② 看起来是校验工具的 `test-html-bundle` 其实是写库脚本。逐个核对后再决定是否加闸门。

为什么不采用 `createDatabase(url, { access: "read" | "write" })`：`access` 是**声明不是控制**，标了 read 也拦不住一条 `UPDATE`；而且要把 17 个调用点逐个标注，标错的后果是静默的。读写意图只有脚本自己知道，闸门放在脚本与 `index.js` 里才是可执行的。

**A3 worker / 迁移条件化**：与 A2b 同一处实现，`migrate` 与 `startReplyWorker` 都先过 `assertWriteAllowed`。

**A4 dev 启动横幅**：位置 `scripts/dev.js:85` 附近，打印生效目标、来源（shell / env 文件）、库名、迁移与 worker 状态、写权限。

**A5 旁路脚本统一配置解析**（这些脚本**不经过** `createDatabase()`，必须单独修）

- 位置：`scripts/backup.js:6`、`scripts/restore-check.js:10`、`scripts/mysql-bootstrap.js:4`、`scripts/app.ps1:21-22`、`scripts/ensure-local-mysql.js:8`
- 改法：全部改用 `resolveTargetDatabaseUrl()`；顺手清理 `server/db.js:15` 的遗留报错文案、`shared/preview-ticket.mjs:8-9` 的弱兜底（缺密钥即失败，不要退化为硬编码常量）。
- 验收：`npm run db:backup` 不再抛 `ERR_INVALID_URL`；设了 `DEV_DATABASE_HOST` 时 `isPortableLocalMysql()` 返回 true。

**A6 生产凭据离开工作树**

- `.code_deploy/env.b64`（生产 `.env` 的 base64，含 DB 口令、`CREDENTIAL_ENCRYPTION_KEY`、模型 API Key）移出仓库目录；base64 不是加密。
- 本地排查改用**只读 MySQL 账号**（`GRANT SELECT`）：这是唯一无法用代码绕过的边界。

### B 开发模式与预览的安全边界（P0）

**B1 移除 `devCode` 回显**（`server/http-app.js:145-150`）：只写日志；如要保留开发便利，加 `COTHREAD_DEV_ECHO_CODE=1` 显式开启。

**B2 开发默认绑 loopback**（`server/runtime-config.js:3` + `scripts/dev.js`）：dev/test 进程绑 `127.0.0.1`，生产仍 `0.0.0.0`；提供 `COTHREAD_DEV_HOST` 逃生开关。

**B3 三个独立的判断（不要合并成一个开关）**

| 判断 | 变量 | 规则 |
|---|---|---|
| 能否连**远程**库 | `COTHREAD_ALLOW_REMOTE_DB` | 生产进程自动允许（ECS 本来就连远端 RDS）；非生产进程必须显式 =1（不再因为"绑了 0.0.0.0"就放行） |
| 能否选**生产目标** | `COTHREAD_DB_TARGET=prod` | 无隐式默认；dev 进程必须显式设置 |
| 能否**写**生产目标 | `COTHREAD_ALLOW_PROD_WRITE=1` | 只对写操作生效；只读排查不需要它 |

现状问题：`server/database-policy.js:172-174` 把"远程连接"与"绑定地址"绑在一起判断，一个开关同时决定了太多事。

**B4 HTML 预览同源脚本**
- 位置：`server/http-app.js:855-876`（`sendVersionPreview`）
- 改法：响应加 `Content-Security-Policy: sandbox; default-src 'none'`；或对 `text/html` 改 `Content-Disposition: attachment`。
- 配套：`web/Documents.tsx:2636-2640` 的"在电脑浏览器中打开"改为打开沙箱预览页，不再直开原始版本 URL。
- 验收：上传含 `<script>fetch('/api/tokens')</script>` 的 HTML，经该按钮打开后脚本访问不到同源 API。

### C 关键失败路径日志（P0）

**C1** `server/http-app.js:1002-1003`：补 `requestId`（`server/request-timing.js` 已生成）、`method`、`route`、`message`、`stack`。

**C2** `scripts/migrate.js:102`：打印 `{ migrationName, statementNumber, code, message }` —— 这些字段在 80-81 行已经挂上却被丢弃。

**C3（可选 P2）** 统一 logger。当前分布：`server/` 51 处 `console.*`（其中 `console.log` 8 处），`server+scripts+shared` 合计 141 处。

### D 自动化与测试（P1）

**D1 CI**
- job1：`npm ci && npm run build` + 40 个无 DB 测试（**今天就能上，不需要 MySQL，也不需要先"抽无 DB 单测"**）。
- job2：用 `mysql:8.4.9` service 容器（`compose.yaml` 已有同镜像）跑 DB 集成测试。

**D2 测试隔离粒度**
- 38 个 DB 测试从"每用例清库 + 重放 87 个迁移"降到"每文件一次"。
- `package.json:24` 的 `--env-file=.env` 改 `--env-file-if-exists`，缺配置时给明确指引。

**D3 lint / format**：补 prettier 配置 + `lint` script，或移除未使用的 `prettier` 依赖。

### E 结构性债（P2）

**E1 `web/Documents.tsx`**：先机械外提展示组件（树 + 拖拽 / 预览 / 浏览器多标签 / 变更日志 / 对话框），再把 `subtreeStats`、`artifactVersionRows`、collator 提进 `useMemo`，搜索输入用 `useDeferredValue`。

**E2 CSS**：去掉 1405 处 `var()` 第二参数（令牌不再被字面量覆盖）；清理 182 个重复选择器，其中 `.document-change-log-*` 旧段（2476-2516）已被 8269-8509 整段覆盖。

**E3 重复代码**：优先 `Documents.tsx ↔ WorkspaceApp.tsx` 的浮层菜单三件套（30 个重复窗口），抽 `useFloatingMenu`。

**E4 环境变量文档**：补齐 `.env.example`（40 vs 19），并区分"部署必须配置"与"进程内注入/内部使用"。

**E5 后端结构**：迁移加 checksum（改过的已应用文件应报错而非静默跳过）；`server/service.js`（2307 行 / 63 方法）与 `server/task-pool.js`（1461 行 / 72 函数）按域拆分。

**E6 运维加固**：前端 `ErrorBoundary`；`app.set("trust proxy", 1)` 改为信任具体反代网段；`uncaughtException` / `unhandledRejection` 兜底；`compose.yaml` 补 app 服务与 `restart` 策略。

## 4. 明确不做（本期范围外）

- 不改名 `DATABASE_HOST_*` / `TEST_DATABASE_HOST_*`；
- 不动密码 / 令牌 / 加密原语（scrypt、AES-256-GCM、Cookie 策略、SQL 参数化）；
- 不给 `createDatabase()` 加 `access` 声明式参数（见 A2b 理由）；
- 不引入对象存储、消息队列、多实例调度；
- 不为迁移写 down / rollback（只加 checksum）；
- 不重做 mermaid / xlsx 的懒加载策略（现状已良好，仅可选恢复 `chunkSizeWarningLimit` 默认值）。

## 5. 执行顺序与依赖

1. **A5 最先做**（修已复现的崩溃，与 target 设计无耦合）
2. A1 → A2 → A2b/A3
3. A4 / A6 可与 A2 并行
4. B1 / B2 / B3 依赖 A1 的 target 概念；B4 独立
5. C1 / C2 独立，随时可做
6. D1 在 C 之后立即做；D2 是 D1 job2 的前置
7. E 系列全部排在 A–D 之后

## 6. 验收清单（每条标注目标与读写性质）

```powershell
# --- 不触库 ---
npm run build                       # tsc 0 错 + vite 构建
node --test tests/database-policy.test.js tests/document-name.test.js tests/preview-mime.test.js

# --- 只读（目标影响结果，先看横幅）---
node -e "import('./scripts/ensure-local-mysql.js').then(m=>console.log(m.isPortableLocalMysql()))"   # 设了 DEV_DATABASE_HOST 时应为 true
npm run db:backup                   # ⚠️ 目标=prod 时会真实读取生产库并落备份文件，属于生产读取操作

# --- 预期失败（验证守卫生效，不要绕过）---
node scripts/demo.js                                   # 未设目标 → 报错并提示设置 COTHREAD_DB_TARGET
$env:COTHREAD_DB_TARGET="prod"; node scripts/demo.js   # 写闸门 → 拒绝写入
env:COTHREAD_DB_TARGET="prod"; npm test                # 测试入口 → 拒绝 prod，要求 test

# --- 只读脚本在 prod 目标下应仍可用（不被误伤）---
$env:COTHREAD_DB_TARGET="prod"; node scripts/verify-html-bytes.mjs

# --- 配置生效性 ---
$env:COTHREAD_DB_TARGET="prod"; npm run dev            # 横幅：目标=prod(来源:shell) · 迁移=跳过 · worker=关闭
```

每个脚本入口（`backup` / `restore-check` / `migrate` / `seed` / `demo` / `ipgeo:import` / 预览夹具）在动作前**先打印目标、库名与写权限**，避免"跑下去才发现连的是生产"。

注意：DB 集成测试请指向隔离测试库。当前 `.env` 的 `TEST_DATABASE_*` 已指向 `cothread_test`，`tests/database.js` 另有库名白名单并显式拒绝 `cothread` / `cothread_dev`；在 A1/A2 落地前，`npm run dev`、`db:migrate`、`db:seed`、`demo` 仍默认走正式库配置，改动期间先不要执行。

## 7. 风险与回滚

- **唯一线上风险**：`server/makers.js:17` 改为显式传参。改完必须用 Makers 路径测试覆盖（`tests/makers*.test.js`）。
- **行为变更**：`npm run dev` 的默认目标从 prod 改为 dev。习惯"直接 `npm run dev` 连正式库排查"的人需要改成 `$env:COTHREAD_DB_TARGET="prod"; npm run dev`；必须在 README 写明。
- **命令级覆盖的副作用**：shell 里残留的 `COTHREAD_DB_TARGET` 会静默压过 `.env`（事实 15）。缓解：启动横幅永远打印生效目标与来源。
- A1 引入必填目标会让未更新的部署启动失败 —— 已用"`--production` 默认 prod"规避。
- B2 改默认绑 loopback 会影响依赖局域网访问开发服务的人 —— 提供 `COTHREAD_DEV_HOST` 逃生开关。
- 全部改动都在配置 / 日志 / 守卫层，无数据结构变更；回滚 = 还原变量与函数签名。

## 8. 修订记录

- **v1.2（2026-09-29）**
  - 修正统计口径：行数改为**总行数（含空行）**——`Documents.tsx` 4652、`WorkspaceApp.tsx` 2934、`service.js` 2307、`task-pool.js` 1461；v1.0/v1.1 的数字是非空行（PowerShell `Measure-Object -Line` 会跳过空行）。hook 数标注为"调用点计，不含 import"（含 import 则各 +1）。
  - 采纳 GPT：A2 明确三个解析函数 + `resolveTargetDatabaseUrl()` 分派；`npm test` 的强制 test 落在 `tests/database.js`；`ensure-local-mysql` 改用 dev 解析器。
  - 采纳 GPT：A2b 补齐 `restore-check`、`mysql-bootstrap`、`agent-smoke`、`agent-recovery-check` 与 `makers.js` 的迁移/初始化；并明确"不按文件名判断读写"。
  - 采纳 GPT：B3 拆成三个独立判断（远程连接 / 生产目标 / 生产写入）。
  - 采纳 GPT：§6 验收逐条标注目标与读写性质，并要求脚本入口先打印目标与写权限。
  - 按"不按文件名判断"重新核对全部脚本：`test-html-bundle.mjs` 从只读改判为**写**（INSERT `versions`/`artifacts`）；`verify-html-bytes` / `compare-html-preview` / `html-preview-diff` / `audit-html-assets` 确认为真只读；`summary-check`、`agent-recovery-check` 列入待确认。
- **v1.1**：采纳命令级目标覆盖与逐命令默认目标；`createDatabase(url,{access})` 改为"目标解析 + 脚本级写闸门"。
- **v1.0**：首版（三轮评估合并）。
