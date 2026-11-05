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

剩余 150 个 `.js` 文件（被引用次数实测于 2026-11-05）：

| 批次 | 范围                                                                  | 文件数 |
| ---- | --------------------------------------------------------------------- | ------ |
| 3    | 叶模块剩余（被 0–1 个文件引用，多为路由与 `service-*` 适配层）        | 17     |
| 4    | 被 2–4 个文件引用                                                     | 63     |
| 5    | 被 5–9 个文件引用                                                     | 39     |
| 6    | 被 10+ 个文件引用（含 `service.js`、`project-memory.js`）             | 30     |
| 7    | 入口 `server/index.js` 与 `package.json` / systemd / 部署脚本里的路径 | 1      |

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
