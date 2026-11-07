# 迁移重入与幂等

迁移执行器 `scripts/migrate.js` 遇到「这条 DDL 已经生效、但迁移回执还没写」时，怎么判断能不能跳过。真实触发场景是某一条迁移执行到一半崩溃后重跑那一条——MySQL 的 DDL 独立提交，冷启动会在库里留下已建好的表、已加的列，回执却没写。

## 判定口径

跳过一条语句前，必须确认「它确实已以同样的定义存在」，否则就是掩盖真实失败。重入判定分五类：

| 错误码                         | 判定方式                                                             | 覆盖的语句                       |
| ------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| `ER_TABLE_EXISTS_ERROR`        | 迁移写的列都在库里、类型兼容（库里多出的列是后续迁移加的，不算冲突） | `CREATE TABLE`                   |
| `ER_DUP_FIELDNAME`             | 逐列比对类型、可空性、默认值、`EXTRA`、排序规则                      | `ADD COLUMN`（含多列一条语句）   |
| `ER_DUP_KEYNAME`               | 比对索引的列序列、唯一性、可见性                                     | `ADD INDEX` / `CREATE INDEX`     |
| `ER_CHECK_CONSTRAINT_DUP_NAME` | 归一后比对约束表达式（库里带 `_utf8mb4` 前缀、反引号与转义反斜杠）   | `ADD CONSTRAINT ... CHECK`       |
| `ER_FK_DUP_NAME`               | 比对约束名、所属表、本表列、被引用表与被引用列                       | `ADD CONSTRAINT ... FOREIGN KEY` |

`ER_CANT_DROP_FIELD_OR_KEY`（`DROP COLUMN`）的既有判定不变：只有确认该列确实不存在才跳过。

## 类型比较：演进与破坏的区别

列类型不一致时，只有「迁移链里确实有更晚的迁移改过这一列」才算链内演进、可以容忍（例如 007 加 `system_key VARCHAR(40)`，038 改成 `VARCHAR(80)`）。链里从没改过的列被改窄——那是人为破坏或环境漂移——必须仍然失败并让迁移报 `ER_DUP_FIELDNAME`。`tests/migration-recovery.test.js` 有一条用例专门锁定这个语义：把 `017_child_agents.sql` 的 `parent_message_id` 改成 `CHAR(12)` 后重跑迁移必须失败。

## 边界：整条链重跑不保证安全

迁移链里有 3 处 `RENAME TABLE`、6 处 `RENAME COLUMN`、14 处 `DROP TABLE`、12 处 `DROP COLUMN`、10 处 `MODIFY COLUMN`。被重命名过的那几条迁移（046、047、052、114、115、128、146、147、149、220）在「清空 `schema_migrations` 后整条链重跑」时，库里的表名与列名已经和迁移里写的不同（例如 052 把 `agent_l1_sessions` 重命名为 `agent_project_sessions`），结构比对无法判定，仍会失败。

**这是链的历史事实，不是执行器的缺陷。** 需要保证的是「某一条迁移崩溃后重跑那一条」——这一类由上面的判定覆盖。

## 门禁

`tests/migration-reentry.test.js` 锁定纯逻辑部分：类型归一（BOOLEAN 与 `tinyint(1)` 同型、整数显示宽度可忽略）、演进判定（链里改过才容忍）、多列 `ALTER` 的解析（`ADD INDEX` / `ADD FOREIGN KEY` 不算列）、顶层逗号切分忽略嵌套括号。

本文件只写已确认的现行行为。
