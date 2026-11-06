# 数据库查询合并与连接池

首屏与迭代上下文的查询合并口径，以及连接池上限的取值依据。

## 连接池

`server/db.ts` 的 `DEFAULT_POOL_SIZE` 是 20，可由 `DATABASE_POOL_SIZE` 覆盖。取这个值的原因是单个请求会并行发起十几条查询：迭代上下文一次扇出 12 条。池比并发查询数小的时候，查询在池内排队，`Server-Timing` 里的 `db_sum` 会明显大于 `db`，差值就是排队时间。

`server/index.ts` 建两个池：请求池用 `DATABASE_POOL_SIZE || DEFAULT_POOL_SIZE`，工作池用 `DATABASE_WORK_POOL_SIZE || 16`。

## 查询合并

以下查询读的是同一批数据，合成一条，口径与拆分版一致：

- `threadReadSummary`（`server/thread-reads.ts`）：已读位、未读数、未读提及、收件箱计数合成一条，`LEFT JOIN thread_reads` 取已读位；没有已读记录时 `COALESCE(last_read_sequence,'0')` 与拆分版的 `|| "0"` 结果相同。
- 迭代上下文（`server/service-iterations.ts`）：工具耗时与轮次口径扫的是同一批 `agent_events`，合并为一条聚合。耗时累加由 `CASE WHEN finished_at IS NOT NULL AND tool<>'thinking'` 限定，轮次计数 `COUNT(DISTINCT ...)` 不带这两个限定，两个口径互不影响。

迭代上下文的并发查询由 13 条降为 12 条。

## 实测

2026-11-06 在本机用 git worktree 拉基线（f02bce7）与新代码交错打点，取中位数（n=14）：

| 接口                    | db_count | db ms         | db_sum ms     | app ms        |
| ----------------------- | -------- | ------------- | ------------- | ------------- |
| `GET /api/workspace`    | 43 → 39  | 63.2 → 49.1   | 279.1 → 176.2 | 66.4 → 51.9   |
| `GET /api/threads/:id`  | 21 → 17  | 63.9 → 54.8   | 183.5 → 126.4 | 73.7 → 63.9   |
| `GET /api/projects/:id` | 20 → 20  | 148.3 → 143.4 | 188.7 → 176.4 | 159.5 → 153.4 |

拆分归因：池固定 8 时，只合并查询让 `/api/workspace` 的 `db_sum` 从 279.1ms 降到 237.0ms；池提到 20 后降到 176.2ms。

改动落地后重启开发服务实测首字节：`/api/workspace` 从 290ms 降到 75ms，`/api/notifications?summary=1` 从 38ms 降到 7ms，`/api/projects` 从 22ms 降到 20ms。响应体大小不变（`/api/workspace` 仍为 20105 字节）。

## 已知未处理

原先记在本节的「`visibleFileIndexSql` 二次方展开」已于 2026-11-06 处理：成因是引用型关联组按「项目内文件数」逐组扫同名候选，改为按关联组的目标版本文件名查 `versions`（迁移 224 加函数索引 `versions_filename_lower`）。判定口径未变，等价性与实测见 [文件索引设计](17-file-index-design.md)。

本文件只写已确认的现行行为。
