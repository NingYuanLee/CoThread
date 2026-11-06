# 测试执行策略与耗时

无数据库测试的入口是 `scripts/test-unit.js`，带数据库的按测试库分片跑 `scripts/test-shards.mjs`。

## 调度

`scripts/test-unit.js` 把所有无数据库测试文件交给一个 `node --test` 进程，由 Node 自带调度器并发执行（默认并发 = CPU 核数 - 1）。实测过 `--test-shard` 分路和自定义多进程分组，都不快：

| 并发数 | 耗时                     |
| ------ | ------------------------ |
| 8      | 26.4s                    |
| 16     | 23.5s                    |
| 24     | 23.1s                    |
| 32     | 24.8s                    |
| 48     | 61s，且出现 6 个偶发失败 |

所以保留 Node 自带调度，只做两件事：

- 把会拉起 DSH runtime 的文件（源码里带 `initializeTimeoutMs`）排到派发队首。Node 按给定顺序把文件丢进工作队列，重型文件排队尾会让关键路径变成「队列等待 + 该文件耗时」。
- 输出总耗时；`TEST_UNIT_CONCURRENCY` 可覆盖并发数。

`scripts/test-shards.mjs` 用同样的重型优先排序。

## 固定等待的用例

沙箱生命周期用例里每个用例都有 3.5 秒、2.5 秒的固定等待，用来观察后台进程是否被回收。多个用例并发跑时这些等待可以重叠：`tests/local-sandbox-lifecycle.test.js` 与 `tests/local-sandbox-fault.test.js` 包进 `describe(..., { concurrency: true })`，等待时长与断言都没改，只是让它们重叠。

实测（同一台机，逐文件换版本跑）：

| 文件                              | 改前  | 改后  |
| --------------------------------- | ----- | ----- |
| `local-sandbox-lifecycle.test.js` | 34.8s | 10.9s |
| `local-sandbox-fault.test.js`     | 14.6s | 8.8s  |
| `windows-client.test.js`          | 20.9s | 19.6s |

`tests/windows-client.test.js` 里最慢的单例是 detached worktree 忽略主检出目录未提交改动那条：它要跑 13 到 18 次 git 子进程。把两次 `git config` 合成 commit 命令的 `-c` 参数，省掉 2 次子进程；断言与提交的 author/committer 都与原来一致。

## DSH runtime 用例的超时

四个文件会真的拉起 DSH runtime：`context-runtime`、`conversation-memory-runtime`、`laoweng-image-runtime`、`model-runtime-config`。它们共用 profile 初始化，并行跑时初始化会被拖长，原来的 `initializeTimeoutMs: 30000` 会误判失败。放宽到 120000，node 级用例 timeout 同步放宽到 300s；断言语义没动。

机器满载时这四个文件并发跑需要 53.6s，串行跑需要 110.0s（都是 5/5 通过）。串行更慢，所以不采用「重型组串行」，保留并行 + 放宽初始化超时。

## 判定语义

改动只影响调度与超时，不影响判定。同一份「一个必过 + 一个必败」的探针用例分别用改前改后的入口跑，退出码、失败计数、失败是否被报出来完全一致。

按 SQL 片段匹配的断言要跟着查询改写一起看。`tests/chat-pending-query.test.js` 原本按 `m.sequence>COALESCE` 截获「待读消息」查询来断言游标精度；`threadReadSummary` 合并成一条后，未读计数子查询也带上了同一片段，于是截获到返回聚合标量（没有 `id` 列）的那条，断言拿到 `[undefined]`。现在截获条件同时要求这条查询确实选了消息行（`SELECT m.id`），并加了一条「确实截获到查询」的断言，避免条件收窄后断言变成空跑。

## 跑库测试需要的连接

库测试要连独立测试库：库名必须含独立单词 dev 或 test，且不能是 `cothread`、`cothread_dev`（`tests/database.js` 会直接拒绝并清库）。本机 `.env` 的 `TEST_DATABASE_HOST_*` 指向远端 RDS，从本机连会被服务端断开（`PROTOCOL_CONNECTION_LOST`），这时要把 `TEST_DATABASE_HOST_PUBLIC`、`TEST_DATABASE_HOST_INTERNAL` 临时覆盖到本机 MySQL 的 `cothread_test`（账号用本机 MySQL 账号），跑完不必改回 `.env`。

## 同一个测试库不能并发跑两套测试

`tests/database.js` 用 MySQL 命名锁（`GET_LOCK('cothread_test:<库名>')`）做跨进程互斥：谁拿到锁谁才能改这个库，锁在整个文件运行期间持有，文件结束才释放。所以**两套测试同时跑同一个库时，后一套会等锁**（最多 120 秒，然后报「等待测试库锁超时」）。

但锁挡不住绕过 `testDatabase()` 直接动这个库的动作。2026-11-06 出现过一次：`tests/agent-member-understanding.test.js` 在全量套件里偶发失败，症状是「刚写进去的 `agent_member_summaries` 行不见了」加「`messages` 的 sequence 倒着走」——只有一次并发的 DROP + 重建表能同时造成这两点。那次失败与被测代码无关：单独跑该文件 14 次全过，之后连续 5 轮全量套件也全过，只有在同一个库上同时跑第二套测试时出现过。

为此在 `tests/database.js` 加了两道防线：

- **重置前确认锁仍在本会话手上**（`IS_USED_LOCK` 与 `CONNECTION_ID()` 比对）。锁一旦丢失，本进程自己的重置就会抹掉正在跑的另一个进程的数据——两边互为受害者，所以宁可不重置、直接报错。
- **运行期间盯住 `messages` 表的创建时间**。表被重建说明有别的进程重建了 schema（会同时清掉本文件刚写的数据、并把自增列拨回起点），这时本文件后面的断言全部不可信，直接报错。取 `information_schema` 的元数据要**先关掉缓存**（`SET SESSION information_schema_stats_expiry = 0`），否则 MySQL 8 默认缓存 24 小时，表删了也照样查到旧记录。

这两道防线只负责「把静默的数据损坏变成一句能归因的报错」，不替代「不要在同一个库上并发跑两套测试」这条约定。

## 当前耗时

2026-11-06 机器空闲时全量无数据库测试：535 个用例全部通过，用时 14.4 秒。

本文件只写已确认的现行行为。
