# server/ 的 TypeScript 迁移

`server/` 原本是纯 JavaScript 且没有类型检查（`tsconfig.json` 的 `include` 只有 `web`）。这份文档记录把它逐步迁到 TypeScript 的约定、工具和进度。**迁移是进行中的状态，不是已完成状态**；没列在「已转换」里的文件仍是 `.js`。

## 运行方式：没有编译步骤

项目直接以 Node 原生类型擦除（type stripping）运行 TS 源码，`process.features.typescript` 为 `strip`。`npm start` / `npm run dev` 与迁移前一样，只是多出来的 `.ts` 文件由 Node 现场擦除类型后执行，不产出编译产物、不经过 bundler。

由此得到一条**硬约束**：

> Node 不会把 `./x.js` 解析到 `x.ts`。所以一个文件从 `.js` 改名成 `.ts` 之后，**所有引用它的说明符必须同步改成 `.ts`**，否则运行期直接 `ERR_MODULE_NOT_FOUND`。

引用形式共有四种，改名时都要一起改：

1. 静态 import / export：`import { x } from "./db.js"`
2. 动态 import：`import("./db.js")`
3. 测试文件里的相对路径：`tests/*.test.js` 里的 `../server/db.js`
4. 元数据字符串：如 `dsh-layer/cothread-plugin-registry.mjs` 的 `sourceFiles` 里的 `"server/x.js"`

转换工具 `scripts/server-ts-migrate.mjs` 覆盖这四种，改名与改写引用在同一步完成。

## 擦除模式的语法约束

纯擦除（`strip`）只删除类型标注，不做代码生成。以下语法会直接运行失败，迁移时**不要用**：

- `enum` —— 用 `as const` 对象替代（`server/task-stats.ts` 的 `BUCKETS` 是范例）
- `namespace` / `module` 里的运行时代码
- 构造函数参数属性（`constructor(private x: T)`）
- 实验性装饰器

```ts
// 不要
enum Status {
  Pending = "pending",
}

// 要
const STATUS = { pending: "pending" } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];
```

## 类型检查

`tsconfig.server.json` 单独管 `server/**/*.ts`，关键设置：

| 设置                          | 值         | 原因                                                  |
| ----------------------------- | ---------- | ----------------------------------------------------- |
| `allowJs`                     | `true`     | 让 `.ts` 能引用尚未转换的 `.js`，并从 JS 源码推断类型 |
| `checkJs`                     | `false`    | 未转换的 `.js` **不报错**，只有转过的 `.ts` 受检查    |
| `allowImportingTsExtensions`  | `true`     | 允许 `import ... from "./x.ts"`；配合 `noEmit` 使用   |
| `module` / `moduleResolution` | `NodeNext` | 与 Node ESM 的真实解析一致                            |
| `strict`                      | `true`     | 转过的文件必须完全标注，不留隐式 `any`                |

`npm run typecheck:server` 单独跑它；`npm run lint` 已把这条挂到最前面，所以**转过的文件不会退化成无类型**。

JS 与 TS 可以任意方向互引：`.ts` 引 `.js`、`.js` 引 `.ts` 都能加载，迁移期间不需要一次性全转。

## 共享类型

`server/types.ts` 放跨文件复用的基础类型：

- `Db`：一次数据库调用的连接，`Pool | PoolConnection`。传 `Pool` 表示自动提交，传 `PoolConnection` 表示在 `transaction()` 里。
- `SqlParams`：SQL 参数数组。

新转的文件优先复用它，不要各自重新定义 `Db`。

## 未转换的 JS 需要类型时怎么办

给 JS 函数补 **JSDoc**，不要为了类型去改逻辑，也不要急着转整个文件。例：`server/environment-variables.js` 的 `setEnvironmentVariable` 第 6 个参数从默认值会被推成 `null`，补一行 `@param {string | null} [updatedBy]` 即可让调用方传用户 ID 通过检查。

## 转换流程

```bash
# 1. 先 dry-run，看清会改哪些引用点
node scripts/server-ts-migrate.mjs server/某个文件.js --dry-run

# 2. 确认后执行（改名 + 改写引用）
node scripts/server-ts-migrate.mjs server/某个文件.js

# 3. 给新的 .ts 补类型标注
# 4. 验证
npm run lint        # 含 typecheck:server
npm run build       # web 侧未受影响
npm test            # 集成测试需要测试库
```

检查顺序也有讲究：**先改低耦合文件**（被引用次数少的），单个文件的引用点少、diff 可审查。枢纽文件引用点多（`server/db.ts` 改名牵动 267 处、259 个文件），但类型收益也最大，做成单独一个提交、单独跑一轮完整验证，不要和别的转换混在一起。

## 进度

已转换（2026-11-05，第一批，用于跑通工具链）：

| 文件                               | 行数 | 说明                               |
| ---------------------------------- | ---- | ---------------------------------- |
| `server/coordinator-persona.ts`    | 2    | 小祥人设常量                       |
| `server/thread-prompt-state.ts`    | 30   | 每迭代已下发资料基线（进程内 Map） |
| `server/task-stats.ts`             | 95   | 本迭代任务四阶段统计               |
| `server/user-skill-credentials.ts` | 30   | 个人技能凭据读写包装               |
| `server/types.ts`                  | 18   | 新增：共享类型                     |

第二批（同日晚，仍是低耦合模块；不含依然依赖未转换枢纽的文件）：

| 文件                                  | 行数 | 说明                                     |
| ------------------------------------- | ---- | ---------------------------------------- |
| `server/profile.ts`                   | 63   | 个人资料校验 schema 与对外的资料结构     |
| `server/documents/renditions.ts`      | 131  | 派生文件存储层（`version_renditions`）   |
| `server/office-renditions.ts`         | 133  | 派生文件编排：单飞、写回、失败退避       |
| `server/file-index-submit-tool.ts`    | 139  | 文件识别桥接（本地 HTTP + 令牌校验）     |
| `server/agent-task-sync.ts`           | 189  | 本地执行器状态同步到任务池               |
| `server/request-parts.ts`             | 80   | 分片上传路由（首个 Express 路由文件）    |
| `server/document-organization-run.ts` | 212  | 文档整理作业执行（该能力已下线，代码在） |

第三批（枢纽优先）：`server/db.ts`。行数只有 151，但它是全仓引用最多的模块之一——改名牵动 **267 处引用、259 个文件**。转完后 `query<T>()` 与 `transaction<T>()` 带上了真类型（`query` 的 `T` 默认 `any`，既有调用方无需改动），之后每个文件的标注都能基于它，而不是对着 `any` 猜。

| 文件           | 行数 | 说明                                                             |
| -------------- | ---- | ---------------------------------------------------------------- |
| `server/db.ts` | 195  | 连接池、`query`/`transaction` 泛型、死锁重试、事务标记与连接回收 |

第四批（小型纯逻辑模块，依赖已全部转换，因此能标出真类型）：

| 文件                                      | 行数 | 说明                                        |
| ----------------------------------------- | ---- | ------------------------------------------- |
| `server/http-error.ts`                    | 16   | 带状态码的错误基类（33 处引用，收益最高）   |
| `server/child-agent-binding.ts`           | 30   | 从工具结果判断子 Agent 绑定                 |
| `server/agent-timing-log.ts`              | 17   | 计时日志的字段收敛                          |
| `server/assets.ts`                        | 17   | 随包静态文件路径解析                        |
| `server/coordinator-turn.ts`              | 21   | 消息所属「轮」的判定                        |
| `server/rate-window.ts`                   | 20   | 滑动窗口计数与过期清理                      |
| `server/visual-capability.ts`             | 30   | 模型图片能力开关与跳过说明                  |
| `server/conversation-memory-integrity.ts` | 22   | 记忆来源完整性的 SQL 片段                   |
| `server/json-body-limit.ts`               | 26   | 按路由返回请求体上限                        |
| `server/agent-errors.ts`                  | 40   | 把 Agent 失败收敛成可诊断的代码             |
| `server/named-lock.ts`                    | 51   | MySQL 命名锁的获取与释放（受边界规则 9 管） |

第五批（同策略，12 个依赖已全转换的小模块）：

| 文件                          | 行数 | 说明                                    |
| ----------------------------- | ---- | --------------------------------------- |
| `server/message-quotes.ts`    | 41   | 引用消息的单层预览（泛型保留入参形状）  |
| `server/session-lock.ts`      | 36   | 迭代上下文锁与「是否还有活跃协调者」    |
| `server/thread-presence.ts`   | 31   | 谁正在看哪条迭代（进程内登记表）        |
| `server/agent-session.ts`     | 53   | 会话定位表：小祥按迭代、子 Agent 按任务 |
| `server/runtime-config.ts`    | 38   | 监听地址、来源白名单、是否 HTTPS        |
| `server/service-support.ts`   | 43   | `id`/`title`/`fail`/`mentions` 等基元   |
| `server/human-challenge.ts`   | 37   | 人机校验题与 SVG                        |
| `server/project-image.ts`     | 44   | 项目图片的校验、地址与 SQL 片段         |
| `server/visual-artifacts.ts`  | 53   | 视觉附件的写入与读取                    |
| `server/file-index-format.ts` | 52   | 文件索引正文渲染（状态收敛成联合类型）  |
| `server/model-context.ts`     | 43   | 交给模型的上下文裁剪                    |
| `server/sse-streams.ts`       | 42   | SSE 长连接登记表                        |

第六批（继续吃「依赖已全转换」的存量，12 个）：

| 文件                             | 行数 | 说明                                           |
| -------------------------------- | ---- | ---------------------------------------------- |
| `server/credential-vault.ts`     | 46   | 账号令牌 AES-256-GCM 加解密（AAD 绑定用户）    |
| `server/memory-signal-filter.ts` | 56   | 记忆信号的三层收敛判断                         |
| `server/shutdown.ts`             | 65   | 关闭流程：期限兜底与幂等                       |
| `server/executor-access.ts`      | 74   | 执行器数据库视图（Proxy 包装，失去归属即作废） |
| `server/iteration-state.ts`      | 91   | 迭代写锁与「归档后不可写」                     |
| `server/project-status.ts`       | 68   | 项目现状整份覆盖与 Markdown 去修饰             |
| `server/wiki-briefs.ts`          | 72   | 参与组织简报的刷新与回填                       |
| `server/memory-retry.ts`         | 76   | 记忆作业退避与停止策略                         |
| `server/task-policy.ts`          | 60   | 任务域常量（原本即无隐式 any）                 |
| `server/file-index-path.ts`      | 80   | 文件索引的实时文件夹路径                       |
| `server/request-timing.ts`       | 79   | 请求耗时归并（并发区间去重）                   |
| `server/task-pool-failures.ts`   | 108  | 失败分类、指纹与重试预算计数                   |

第七批（依赖干净但被引用多的模块，6 个）：

| 文件                                    | 行数 | 说明                                       |
| --------------------------------------- | ---- | ------------------------------------------ |
| `server/database-policy.ts`             | 334  | 内外网选择、URL 拼装与「拒绝连远端库」判定 |
| `server/work-events.ts`                 | 116  | 进程内唤醒表与带退化轮询的唤醒循环         |
| `server/thread-activity.ts`             | 183  | 迭代活跃时间、Agent 事件收尾、沙箱保存点   |
| `server/project-facts.ts`               | 119  | 项目事实快照（一致性读事务）               |
| `server/documents/read-text.ts`         | 136  | 文本正文分页与二进制拒读                   |
| `server/conversation-memory-context.ts` | 186  | 联合分析窗口装填与来源完整性校验           |

第八批（12 个，含被 37 处引用的 `auth.ts`）：

| 文件                                  | 行数 | 说明                                             |
| ------------------------------------- | ---- | ------------------------------------------------ |
| `server/auth.ts`                      | 221  | 口令哈希、令牌签发、Bearer/cookie 鉴权与预览票据 |
| `server/file-index-visibility.ts`     | 131  | 文件索引可见性的 SQL 片段                        |
| `server/memory-policy.ts`             | 108  | 记忆来源族与「谁能作废」判定                     |
| `server/documents/service-preview.ts` | 109  | 预览 HTML 的 base 注入与资源路径重写             |
| `server/task-source-notice.ts`        | 105  | 任务来源人的 @ 提醒                              |
| `server/executor-fence.ts`            | 105  | 执行器代次围栏（AsyncLocalStorage）              |
| `server/laoweng-session-turns.ts`     | 100  | 老翁会话轮次合并进历史                           |
| `server/task-pool-helpers.ts`         | 99   | 引用解析、任务书拼装、派活提示                   |
| `server/documents/preview-mime.ts`    | 86   | 上传/预览的 MIME 归一                            |
| `server/ip-location.ts`               | 84   | IP 归属地查询（IPv4 → 整数区间）                 |
| `server/assistant-post.ts`            | 83   | 助手消息去重落库                                 |
| `server/coordinator-events.ts`        | 40   | 协调者事件入队（含 child_result 去重）           |

第九批（5 个较大模块，1300+ 行）：

| 文件                                 | 行数 | 说明                                      |
| ------------------------------------ | ---- | ----------------------------------------- |
| `server/agent-usage.ts`              | 268  | 用量合并、首 token 时延与解码速率的计量器 |
| `server/email-delivery.ts`           | 258  | 验证码邮件、fake-ip 绕过与失败重试        |
| `server/agent-checkpoint.ts`         | 223  | 会话快照重定位与日志去重                  |
| `server/documents/document-audit.ts` | 211  | 文档变更日志的记录与分页查询              |
| `server/task-pool-recovery.ts`       | 151  | 已结束任务下执行记录的收尾与修复          |

第十批（2 个大型模块，897 行）：

| 文件                              | 行数 | 说明                                       |
| --------------------------------- | ---- | ------------------------------------------ |
| `server/agent-live-output.ts`     | 484  | 实时输出的本地覆盖、落库队列与 SSE 闸门    |
| `server/legacy-office-extract.ts` | 413  | OLE2/CFB 解析与 Word 97 piece table 取正文 |

`miaowen-skill.js`（463 行）本轮已改名为 `.ts` 但**标注未完成，已回退**：它内部有 `state`、若干 `unknown` JSON 负载与返回联合类型，靠批量替换只会把错误搬来搬去，需要逐段读代码。留到下一轮单独处理。

第十一批（补完上一轮回退的文件，并开始领域模块）：

| 文件                       | 行数 | 说明                                                             |
| -------------------------- | ---- | ---------------------------------------------------------------- |
| `server/miaowen-skill.ts`  | 532  | 妙问对话：SSE 解析、事件处理、失败文案（上一轮改坏了，本轮重做） |
| `server/service-access.ts` | 136  | 项目/迭代访问判定（第一个 `service-*` 领域模块）                 |

`miaowen-skill` 的做法记一笔：上一轮失败在于**没读透就批量替换**。这次先完整读完 462 行，把 `state`、JSON 负载、返回值三者的关系理清，用一个 `asObject()` 把「普通对象」这个判断收成一处，再整体重写。一次通过。

第十二批（3 个 `service-*` 领域模块，1014 行）：

| 文件                              | 行数 | 说明                       |
| --------------------------------- | ---- | -------------------------- |
| `server/service-notifications.ts` | 237  | 站内信列表、已读与跳转     |
| `server/service-admin.ts`         | 389  | 用户、项目、账号的超级管理 |
| `server/service-projects.ts`      | 388  | 项目、页签排序、项目详情   |

第十三批（2 个最大的域模块，1008 行）：

| 文件                           | 行数 | 说明                                   |
| ------------------------------ | ---- | -------------------------------------- |
| `server/service-iterations.ts` | 488  | 迭代上下文、归档工作流与 13 路并发查询 |
| `server/service-members.ts`    | 520  | 成员增删改、负责人转移、项目管理员     |

第十四批：`server/service-messages.ts`（567 行）——发消息、分页列表、单条读取与成员目录。`insertMessageOperation` 那两个分支（连接池 vs 事务连接）用 `isPool` 守卫拆开，事务内才走 `assertIterationWritable`。

第十五批（6 个小模块，711 行）：`service-notification-operations`(53，第 2 轮因依赖未转而推迟，本轮补上)、`agent-thinking`(237)、`memory-cache`(209)、`inbox-task`(95)、`task-queries`(69)、`reply-actions`(48)。

`service-notification-operations` 现在直接用 `Parameters<typeof notify>` 等派生参数类型——被调方已带类型，不必再自己声明一遍。这是「先转实现、后转适配层」这条顺序带来的直接好处。

第十六批（8 个小模块，592 行）：`conversation-memory-contract`(122)、`document-organization`(100)、`sandbox-provider`(93)、`file-bytes`(69)、`dsh-runtime-config`(67)、`agent-updates`(63)、`queue-context`(45)、`thread-side-state`(33)。

本批新增 `@types/js-yaml`。另外修了一处跨文件类型不一致：`document-organization-run.ts` 原来自己声明了一份 `OrganizationDocument`，与 `document-organization.ts` 导出的同名类型结构不同（`title` 是否含 `null`），改为直接 import 共享那一个。

第十七批（6 个中等模块，788 行）：`task-access`(146)、`memory-decisions`(141)、`task-documents`(138)、`deepseek-web`(132)、`utterance-memory`(122)、`memory-pages`(109)。

至此 `server/` 已过半：**102 个 `.ts` / 97 个 `.js`**。

第十八批（5 个模块，984 行）：`agent-sandbox`(230)、`office-convert`(223)、`task-pool-activity`(210)、`thread-reads`(163)、`sandbox-run`(158)。

本批两个要点：

- `agent-sandbox` 里 `provider.connect` 是可选方法（单次执行的适配器只需要 `create`），但恢复持久工作区时必须能连。用一个局部 `ConnectableProvider` 类型在调用处收窄，不做全局放宽。
- `task-pool-activity` 的 `recordTaskStatusChange` 之前靠 JSDoc 提示 `reason` 类型，转成 `.ts` 后改成真正的参数类型，`agent-task-sync` 的两处报错随之消失。

第十九批（5 个模块，886 行）：`file-index-roots`(202)、`child-agent-context`(184)、`account-audit`(177)、`file-index-extract`(168)、`miniprogram-runtime-environment`(155)。

本批两个类型推断坑：

- `transaction(db, cb)` 的泛型在回调可能返回 `null` 时会被推成 `{}`，属性访问全部报错。显式写 `transaction<Job | null>(pool, cb)` 才正确。
- `new Service(db)` / `acquireSessionLock(db, …)` 要的是 `Pool`，而函数签名收的是 `Db = Pool | PoolConnection`。在函数入口取一次 `const pool = db as Pool`，只在需要池的地方用。

第二十批：`reply-dispatch.ts`(215)、`cloudbase-filter.ts`(199)、`context-compression.ts`(256)。

`documents/versions`(253 行) 与 `environment-variables`(188 行) 本轮改名后**回退**：同批 5 个文件一次报出 154 个错，超出单轮可复核的范围。回退后引用全部改回 `.js`、typecheck 归零——同批塞太多文件时，宁可少转几个也不要留下半成品。（`environment-variables` 已在下一批单独补上；`documents/versions` 仍待转。）

第二十一批：`admin-rbac.ts`(312)、`miniprogram-auth-config.ts`(291)、`environment-variables.ts`(225)。本批 112 个错，符合「3 个文件 / 100 上下」的上限。

`parseJson(value, fallback)` 这类「泛型 + 兜底值」的辅助函数必须显式写 `<T>(value: unknown, fallback: T): T`，否则兜底值 `{}` 会把整个返回值推成 `{}`，后续所有索引访问都报错。

第二十二批：`documents/versions.ts`(326)、`routes/cloudbase-routes.ts`(194)、`context-sync.ts`(128)。本批 124 个错（含 `versions` 之前回退的 62 个），全部解决。

两个值得记的点：

- 路由文件批量标注 `Express` 的 `req` / `res` 后，`req.query.environment` 的类型是 `string | ParsedQs | (string | ParsedQs)[]`，不能直接当 `string` 传给下游。用 `String(...)` 收口，比逐个断言干净。
- `dropDocumentVersionSignals(db, { artifactIds: [...] })` 在 `project-memory.js` 里是 JS，`artifactIds` 的默认值 `[]` 让 TS 推成 `never[]`。用 `Parameters<typeof fn>[1]` 断言参数整体，而不是把数组元素硬转。

第二十三批：`documents/document-tools.ts`(255)、`preview-screenshot.ts`(253)、`memory-graph.ts`(196)。本批 68 个错。

`preview-screenshot` 一开始给 playwright 手写了一套 `PlaywrightBrowser` / `PlaywrightPage` 类型，结果 `chromium.launch()` 返回的是官方 `Browser`，对不上。改成直接 `import type { Browser } from "playwright"`——**有官方类型的库不要自己造**，手写会漂移且漏掉重载。

第二十四批：`agent-capabilities.ts`(288)、`my-work.ts`(183)、`admin-work.ts`(140)。本批 57 个错。

再次踩到同一个坑：用 PowerShell 的 `.Replace()` 写多行替换时，`'\n'` 在单引号里不转义，会把字面 `\n` 写进源码（`TS1127: Invalid character`）。**多行改动一律走 `edit` / `write` 或临时 `.mjs` 脚本**，不要在 shell 里拼多行字符串。

第二十五批：`memory-maintenance.ts`(111)、`task-pool.ts`(110)、`cloud-backend.ts`(66)、`release-executor.ts`(47)。本批 12 个错，是迄今最省的一批——纯转发与薄封装的模块几乎不需要标注。

**本轮踩到「批内重命名」的坑，值得记下来。** `release-executor.js` 与 `cloud-backend.js` 在同一批里转换：迁移工具按**扫描时的磁盘状态**改写说明符，扫 `release-executor` 时 `cloud-backend` 还是 `.js`，所以改写后的 `release-executor.ts` 仍写着 `./cloud-backend.js`。

后果很隐蔽：

- `tsc` **通过**——TS 会把 `.js` 说明符映射到同名 `.ts`；
- Node 运行期**失败**——`ERR_MODULE_NOT_FOUND`，全量测试 30 个文件挂掉。

修完之后补了一次全仓库扫描（`.js` 说明符指向的目标不存在、但同名 `.ts` 存在），确认零残留。以后每批提交前都跑这个检查，不能只依赖 `tsc` 和 `grep .ts`。

`laoweng-context` 与 `memory-backfill` 本轮改名后**回退**：它们依赖 `child-agent-session` 的原生 history 结构（`HistoryMessage[]` 与聚合结果互相赋值），需要整段读完才能标对，留待单独一轮。回退后引用已改回 `.js`、typecheck 归零。

全量测试复跑一次 1096/1096 通过；上一轮出现 1 个 `agent-member-understanding` 的失败，单独跑该文件 5/5 通过、复跑全量也通过，判定为并发下的偶发（与本次改动无关），未作为通过依据。

第二十六批：`org-shelf.ts`(224)、`documents/index.ts`(29，26 处引用的 barrel)、`app.ts`(10，18 处引用)。

本批新增一个迁移辅助脚本 `scripts/server-ts-specifiers.mjs`，检查两类失效说明符：

1. **写 `.js` 但磁盘上只有 `.ts`** —— 上一轮踩到的坑。`tsc` 会通过（TS 把 `.js` 映射到同名 `.ts`），Node 运行期 `ERR_MODULE_NOT_FOUND`。加 `--fix` 可自动改回 `.ts`。
2. **写 `.ts` 但文件不存在** —— 回退已改名文件后、引用方没跟着回退时出现。本批就真实出现过：`tests/cloudbase-hosting.test.js` 仍引用已回退的 `../server/cloudbase-hosting.ts`，导致 9 个测试根本没跑起来（总数从 1096 降到 1087）。

匹配按**行首锚定**，否则会把测试夹具里的字符串（`res.end('import "./leaf.ts"')`）误报成导入。这两类问题 `tsc` 都发现不了，**每批提交前必须跑这个脚本**。

`cloudbase-hosting` 与 `http-app` 本轮改名后**回退**：前者发布链路依赖 CloudBase manager 的动态形状，后者卡在 `Service` 类的推断不完整（方法在 JS 里动态挂载，类型里没有）。两者都要等 `service.js` / `cloudbase.js` 转换后再做。

第二十七批：`discussion-memory.ts`(237)、`memory-backfill.ts`(177)。

**小文件已经全部转完**：剩余 63 个 `.js` 都在 168 行以上，最小的也是 `laoweng-context`(168) 一档。后续每批只能拣中等体量、彼此不互相引用的文件。

`wiki-pages` 本轮改名后**回退**：它的 `mapPage` / `getWikiPage` / `insertCompiled` 之间互相递归引用，需要先定返回类型才能标内部（TS7023/TS7024）。回退时把 10 个文件的引用改回 `.js`——这次是**说明符检查脚本直接列出**要改哪 10 个，不用猜。

第二十八批：`wiki-pages.ts`(288)。这是上一轮回退的那个，本轮补完。

补完的办法就是上轮判断的那样——**先给递归引用环上的函数写显式返回类型**：`getWikiPage` / `listWikiPages` / `createWikiPage` 互相调用，`mapPage` 的返回结构又参与其中，不先钉死返回类型 TS7023/TS7024 必然出现。另外 `listWikiPages` 的实际返回是 `{ pages, canWrite }` 而不是数组，`hydrateFileIndexPaths` 返回的行不带 `projectId`——这些只能读代码才知道，不能靠猜。

第二十九批：`service.ts`(185 行、**152 处引用 / 145 个文件**)。这是整个迁移里杠杆最大的一块——`http-app`、`cloudbase-hosting` 之所以转不动，就是因为门面上的方法是动态转发的、没有类型。

做法：不手抄 60 个方法签名，而是从域操作本身推导：

```ts
type OperationRest<F> = F extends (service: never, ...rest: infer R) => unknown ? R : never;
type OperationResult<F> = F extends (...args: never[]) => infer R ? R : never;
type ParamAt<F extends (...args: never[]) => unknown, N extends number> = Parameters<F>[N];

member(...args: OperationRest<typeof accessDomain.memberOperation>)
  : OperationResult<typeof accessDomain.memberOperation> { … }
```

好处是签名跟着实现走——域操作改了参数，门面立刻在类型上报错，不会静默漂移。管理员那 8 个方法（`users` / `createUser` / …）的 service 之后直接是业务参数，用 `ParamAt<F, N>` 按位置取。

**一个自己造成的失误**：我先写了 `service.ts`，又对 `service.js` 跑迁移工具——工具把 `service.js` 重命名成 `service.ts`，**覆盖掉了我刚写的版本**。重写后才通过。教训：目标文件已存在时不要再对同名 `.js` 跑改名工具。

第三十批：`http-app.ts`(200 行、18 处引用)，以及随之调整的 `app.ts`。这是 `service.ts` 转完后解锁的第一个——此前它卡在「`service.executeRun` 等属性不存在」。

三个只有读代码才知道的类型约束：

- `createApp` 第 2 个参数用解构默认值 `= {}` 时，TS 会从**解构模式**推参数类型：有默认值的变可选、没默认值的变必填，且错误位置绕（指向解构行）。改成 `options: CreateAppOptions = {}`、函数体内再解构，问题消失。
- `authenticate()` 返回 `AuthenticatedUserRow | null`，而 `RequestUser.kind` 是 `"session" | "api"` 且必填。原代码分两次给 `req.user` 赋值，改成先算出 `user` 再判空赋值。
- 错误中间件的 `error` 在 TS 里是 `unknown`（原 JS 里是 `any`），`error.status` / `error.code` 全要显式收窄。

注入项（`executeRun` / `stopAgent` / `startArchiveDraft` / `afterMcpMessage`）的真实签名各不相同，选项类型先用 `unknown` 接住、传参处再收口——比给每个编一个假签名更诚实。

第三十一批：`cloudbase-hosting.ts`(225 行)。这是 `service.ts` 解锁的第三个、也是最后一个此前转不动的文件——至此 `service` / `http-app` / `cloudbase-hosting` 三个「小但难」的全部落地。

它需要给外部 SDK 的类型单独开一个局部形状：`HostingManager`（`uploadFiles` / `setWebsiteDocument` / `getInfo`）。CloudBase 的 manager 在 JS 里是动态对象，这里只声明本文件真正调用的三个方法，不做全量建模。

第三十二批：`documents/file-upload.ts`(232 行，分片上传的三个入口)。

**这是一次提高批量后的回调：** 我同批改了 3 个文件（`file-index-jobs` 270 行、`project-library` 276 行、`file-upload` 232 行），一次报出 91 个错。逐个修到一半发现，剩下两个的尾巴太长，及时回退——只保留已经干净通过 typecheck 的 `file-upload`。**批量大小要按「修完的把握」定，不是按「想推进多少」定。**

`file-upload` 里值得记的一处：这个文件真正调用的 Service 方法只有 5 个（`thread` / `member` / `assertOfficialOrganizing` / `uploadCacheDraft` / `uploadOfficialDocument`）。我先用索引签名 `Record<string, (...args) => ...>` 接，结果 `service.uploadCacheDraft` 的类型变成 `unknown`，反而更糟。改成把这 5 个方法**显式声明成最小契约**，问题消失——迁移期的 Service 视图应当按实际调用点写，不是按「随便什么方法都能调」写。

第三十三批：`index.ts`(236 行) —— **入口文件，批次 7 的最后一项**。至此 `server/index.js` 的改名没有留下任何需要人工跟进的部署侧路径：

- `package.json` 的 `start` / `dev:static` 已改为 `node … server/index.ts`
- `scripts/dev-runtime.js` 的进程识别标记同时保留 `server\index.js` 与 `server\index.ts`——迁移期可能还有旧进程在跑，认不出会误判成"非本项目进程"
- `docs/engineering/05-cloud-environment.md` 里现行运维命令已改；**发布记录 `releases/2026-11-04.md` 保持原样**（那是历史事实，不能回改）

`vite` 也踩到和 playwright 同一个坑：我先手写了 `ViteDevServer` 形状，结果和 `vite` 官方类型对不上（`middlewares` 类型不兼容）。改成 `import("vite").ViteDevServer` 才对——**有官方类型的依赖不要自己造形状**，这已经是我第二次犯。

**启动烟测**（不只是类型通过）：`node server/index.ts --api-only` 实际跑起来，输出 `coThread Server 已启动：http://127.0.0.1:3100`，随后是常规执行器日志。这比"`tsc` 通过 + 单测通过"更进一步，证明 Node 的类型剥离在该入口上确实可用。

第三十四批：`routes/admin.ts`(250 行，管理域全部端点)。本批 101 个错，符合「单文件 / 100 上下」的上限。

三个模式化的处理，值得复用：

- **路由处理器批量标注**：`(req, res)` → `(req: Request, res: Response)`、`(req, _res, next)` → 加 `NextFunction`。44 处一次性解决。
- **`req.params` / `req.query` 收口**：Express 5 的类型里这些取值是 `string | string[]`，全部用 `String(...)` 包一层。
- **领域视图的 `db` 类型统一成 `Db`**：`CapabilityService.db` 原来是 `Pool`，而 `Service.db` 是 `Db`，导致整个 `Service` 传不进去。改成 `Db`（`query()` 本来就接受 `Db`），只在真正要 `transaction()` 的地方收窄——判断依据是「这个视图是否发起事务」，不是「习惯写 Pool」。

顺带把 `RequestUser.scope` 从 `unknown` 收紧成 `string | null`：多个领域视图都要求这个形状，`unknown` 会让 `Service` 和 `req.user` 都传不进这些函数。

第三十五批：`laoweng-context.ts`(168 行)。**最后一个 200 行以内的文件**——此后剩余全部是 270 行以上的中等/大模块。

这个文件上一轮（第二十四批）曾改名后回退，原因是它依赖 `child-agent-session` 的原生 history 结构。本轮补完的关键有两条：

- `messages` 在图里被三种来源反复赋值（checkpoint 快照 / 现场 jsonl / 会话轮次合并），类型必须用第一次赋值的 `typeof messages` 传播，每次重赋值处断言回这个类型，而不是各写各的。
- `transaction(db, cb)` 的回调可能返回 `null` 时，泛型会退化成 `{}`；显式写 `transaction<LaowengJob | null>(pool, cb)` 后 `job.project_id` / `job.task` / `job.id` 才有类型。

第三十六批：`task-dispatch.ts`(270 行，子 Agent 派发与任务书生成)。

一处值得记的：`recordChildLaunchTrace` 的 `brief` 参数原本是 `unknown`，结果 `brief.blocks` / `brief.prompt` / `brief.systemPrompt` 全部报「属性不存在」。把 `brief` 写成它真正的形状（`blocks` / `prompt` / `systemPrompt`）后，下游 8 处访问一并解决——**用 `unknown` 挡住未标清的结构，代价是下游要逐个断言；能写出真实形状时应当写出来**。

剩余 54 个 `.js` 文件（被引用次数实测于 2026-11-05）：

| 批次 | 范围                                                                                | 文件数 |
| ---- | ----------------------------------------------------------------------------------- | ------ |
| 4    | 被 2–4 个文件引用                                                                   | 13     |
| 5    | 被 5–9 个文件引用                                                                   | 15     |
| 6    | 被 10+ 个文件引用（含 `project-memory.js`、`service-monitor.js`、`coordinator.js`） | 18     |
| 其余 | 被 0–1 个文件引用（270 行以上的独立模块）                                           | 8      |

`service-monitor.js`（1056 行）本轮试转后**回退**：它不只是缺参数标注，还有 8 处结构性类型问题（`rows` 可能未赋值、`delete` 只作用于可选字段、日期相减的类型、`never[]` 推断）。批量替换只会把错误搬来搬去，需要完整读一遍再写，留到单独一轮。

## 领域模块的类型策略

`service-*.js` 这类域模块的第一个参数是 `service`（转发门面），而门面本身还没转换。若直接读 `service.js` 的类型，会得到一堆 `(...args: any[]) => any`。

做法是**为本模块实际用到的方法写一个结构化视图**，不抄整个门面：

```ts
export type AccessService = {
  db: Db;
  member(
    user: AccessUser,
    projectId: string,
    write?: boolean,
    db?: Db,
    owner?: boolean,
  ): Promise<unknown>;
};
```

好处有两个：只需要声明真正调用到的方法；门面将来改成 `.ts` 时，这个视图不会立刻失配。

入口最后转：`package.json` 的 `start` / `dev:static`、systemd `ExecStart`、`scripts/ecs-*` 都写着 `server/index.js`，改名要同步改这些地方。

## 选文件的顺序

被引用次数少只是必要条件，**还要看它依赖谁**：

```text
依赖全是已转换模块或标准库  → 现在就能标出有意义的类型
依赖是未转换的枢纽模块      → 只能标成 unknown，等于白转，推迟
```

`server/service-notification-operations.js` 是后一种：它只是把 `service-notifications.js` 的四个函数接到 Service 方法上，参数含义完全由被调方决定。强行转换只能得到 `unknown`，所以**保留 `.js`**，等 `service-notifications.js` 转完再一起转。

## 几个具体写法

**事务回调要标类型。** `transaction()` 还在未转换的 `db.js` 里，回调参数推断成 `any`，`strict` 下直接报错，必须显式标注：

```ts
await transaction(db, async (conn: PoolConnection) => {
  // conn 现在是 PoolConnection，不是 any
});
```

**Express 路由**要 `@types/express`（`^5.0.6`，对应 express 5.3），并且 `req.user` 由鉴权中间件挂上、不在 Express 自带类型里，在 `server/types.ts` 里做了全局扩展：

```ts
declare global {
  namespace Express {
    interface Request {
      user: RequestUser;
    }
  }
}
```

把 `Request` 上的 `user` 声明成必填：未鉴权路由不读它，读它的地方一定经过鉴权中间件。

**连接池与事务连接要靠类型守卫区分。** `conn` 既可能是池也可能是连接，`typeof conn.getConnection === "function"` 在联合类型上直接访问会报错，用守卫收窄：

```ts
function isPool(db: Db): db is Pool {
  return typeof (db as Pool).getConnection === "function";
}
```

## 门禁必须同时支持 .js 与 .ts

迁移期间最危险的不是编译错误，而是**门禁静默失效**：`scripts/check-boundaries.mjs` 原来只 walk `.js` 文件，路径比较和 import 正则也都绑死 `.js` 后缀。第一个文件转成 `.ts` 之后，它就不再参与任何架构规则检查，而检查仍然打印「0 处违例」。

已做两处修正（提交 `f771132`）：

- `walk()` 同时收集 `.js` / `.ts`；路径比较统一用 `stem()` 去掉扩展名；import 说明符正则统一写 `\.(?:js|ts)`。
- 规则 7（数据库通用层不得引入业务依赖）改为忽略 `import type`：类型导入在运行期被完全擦除，不执行被导入模块的任何代码，而该规则防的是运行时副作用。放宽后已实测：插入 `import { Service } from "./service.js"` 仍会被规则 7 抓到。

修正后立刻暴露出一个真实违规：上一批的 `office-renditions.ts` 为了拿行类型深引了 `documents/renditions.ts`，违反「只能经 `documents/index.js` 使用内核」。已改为从 barrel 转发类型。

**加新门禁或改门禁时，先确认它认不认 `.ts`**，否则迁移越往后，「通过」越不可信。

## 已知坑

- **测试里的「复制源文件再导入」会把 `.ts` 写坏。** `tests/assets.test.js` 曾把 `server/assets.ts` 复制成临时目录里的 `assets.mjs` 再 import——Node 只对 `.ts` 做类型擦除，改后缀后按纯 JS 解析，遇到类型标注直接 `SyntaxError`。转换某个模块后，若测试里出现 `copyFile(...) + 另一个后缀`，同步改成同样的 `.ts` 后缀。
- **prettier 只检查改动过的文件**（`scripts/lint.js`），所以历史遗留的格式问题不会自己暴露；`.ts` 同样适用。
- **`tmp/` 在 `.gitignore` 里，prettier 3 默认跳过它**（默认 `--ignore-path` 含 `.gitignore`），拿 `tmp/` 下的副本做格式化验证等于空跑。
- **迁移工具按当前磁盘状态扫描**：同一批传多个文件时，前面的文件已改名，后面扫描会跳过已消失的路径。这是刻意处理，不是 bug。
- **工具不自动改文档**：`docs/engineering/releases/` 是逐字照录的历史记录，路径必须保持当时的写法；其余说明文档里的路径属于文档维护，由人判断后再改，避免重构与文档改动混在一次批量改写里。
- **`git show HEAD:文件 | Out-File` 恢复文件会写成 CRLF**，仓库要求 LF（`.gitattributes` 的 `*.md text eol=lf` 只覆盖部分后缀，JS 走 `* text=auto`），恢复后要再归一一次行尾。
