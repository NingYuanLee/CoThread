# 分页与条数参数

列表接口的 `limit`（每页条数）与 `page`（页码）如何被收口。写这页是因为 MySQL 的 `LIMIT` 只接受整数：字符串拼接 `LIMIT 10.5` 报 `ER_PARSE_ERROR`，走占位符的参数化路径传小数报 `ER_WRONG_ARGUMENTS`，两者最终都被上层错误处理映射成 500。

## 收口规则

`server/limits.ts` 的 `clampLimit(value, def, min, max)` 是唯一的条数收口：

- 非法值（`null` / `undefined` / `NaN` / `±Infinity` / 非数字）回落到 `def`；
- 合法的小数向下截断（`10.5` → `10`）；
- 越界值夹到区间端点。`0` 落到 `min` 而不是 `def`：每页 0 条没有业务含义，按「页大小」的下限处理；
- `max` 是硬上限，超过也夹到 `max`，不会报错。

`server/cloudbase.ts` 有一个同名私有函数，语义不同（`<= 0` 回落 fallback、用 `Math.floor`、服务于腾讯云查询而非 MySQL `LIMIT`），两者不要混用。

## 各接口的区间

| 接口                                                     | 默认 | 最小 | 最大 |
| -------------------------------------------------------- | ---- | ---- | ---- |
| `GET /api/projects/:id/miniprogram/builds`               | 20   | 1    | 100  |
| `GET /api/projects/:id/miniprogram/deployments`          | 20   | 1    | 100  |
| `GET /api/projects/:id/miniprogram/release-requests`     | 30   | 1    | 100  |
| `GET /api/projects/:id/miniprogram/release-applications` | 30   | 1    | 100  |
| `GET /api/projects/:id/agent-logs`                       | 60   | 10   | 200  |
| `GET /api/tasks/:id/agent-logs`                          | 60   | 10   | 200  |
| `GET /api/threads/:id/agent-logs`                        | 60   | 10   | 200  |
| `GET /api/wiki-sessions/agent-logs`                      | 60   | 10   | 200  |
| `GET /api/projects/:id/document-changes`                 | 100  | 1    | 200  |
| `GET /api/projects/:id/tasks`                            | 100  | 1    | 200  |

记忆检索与老翁维护队列是内部调用（老翁经 MCP、Agent 工具），不经过浏览器：`searchProjectMemory` 默认 20、上限 50；项目进程信号默认 40、上限 100；老翁队列默认 50、上限 200；任务记忆默认 200、上限 500，且 `limit` 缺省时不设上限。

## 已知未处理

`GET /api/projects/:id/memory/entries` 等记忆时间线接口用 `pageSize` 而非 `limit` 命名，区间口径与本表一致但走各自的 zod 约束；本文件只列已统一到 `clampLimit` 的调用点。

本文件只写已确认的现行行为。
