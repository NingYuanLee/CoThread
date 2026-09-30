# 小程序发布审批流设计（待确认后实现）

## 目标

发布是生产动作。现状是「L3 只能生成预览，上传只能在界面人工点」——这只有一个开关，没有可追溯的申请与批准记录。
本设计把发布改成**申请 → 批准 → 执行**的可审计流程。

## 适用范围

走审批的目标（后续新增发布目标默认都要走）：

| 目标                                                  | 是否走审批                                      |
| ----------------------------------------------------- | ----------------------------------------------- |
| `wechat_upload`（上传微信版本）                       | 是                                              |
| `cloudbase_static` / `cloudbase_hosted`（Admin 发布） | 是                                              |
| `wechat_preview`（生成开发版预览二维码）              | 否，保持现状                                    |
| CloudBase 数据面写操作（文档增删改、文件上传删除）    | 否，保持现状（开发环境；生产环境尚未开放给 L3） |

## 角色

| 角色                 | 能做什么                                                             |
| -------------------- | -------------------------------------------------------------------- |
| L3（Agent）          | 创建申请、查看自己申请的状态、撤回自己的申请；**不能批准、不能执行** |
| 项目负责人（owner）  | 批准、拒绝、取消、直接执行自己发起的申请                             |
| 项目成员（非 owner） | 只读查看申请与记录                                                   |
| 只读成员（viewer）   | 只读                                                                 |

**不能自我批准**：申请人与批准人不能是同一个账号——**L3 发起的申请只能由 owner 批准**。
owner 自己发起的申请允许自我批准（见下方已确认决定 ②）。

## 状态机

```
                    ┌─────────────┐
   L3/owner 提交 ──► │   pending   │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┬───────────────┐
        │                  │                  │               │
   owner 批准         owner 拒绝        申请人撤回        超过有效期
        │                  │                  │               │
        ▼                  ▼                  ▼               ▼
   ┌─────────┐        ┌──────────┐      ┌───────────┐   ┌──────────┐
   │approved │        │ rejected │      │ cancelled │   │ expired  │
   └────┬────┘        └──────────┘      └───────────┘   └──────────┘
        │  （批准即执行）
        ▼
   ┌───────────┐  失败   ┌────────┐
   │ executing │ ──────► │ failed │
   └─────┬─────┘         └────────┘
         │ 成功
         ▼
   ┌───────────┐
   │ succeeded │
   └───────────┘
```

**批准即执行**：owner 点击「批准」后立即执行对应发布，成功/失败写回同一申请。这样不存在「已批准但没人执行」的悬挂态。

### 关键状态规则

1. **源码哈希绑定**：申请记录提交时的 `source_hash`。执行前重新计算当前源码哈希，若不一致 → 申请转入 `expired`，并提示「源码已变更，请重新提交申请」。这是防止「批准的是 A 版本、上传的是 B 版本」。
2. **同一项目同一目标同时只允许一个 `pending`**：重复提交返回 409 并给出已有申请 ID。
3. **有效期**：`pending` 超过 **24 小时**自动转 `expired`（在读取列表与执行时惰性判定，避免依赖定时器）。
4. **批准的不可变性**：批准后申请内容（版本号、说明、源码哈希、目标）不可修改；要改就撤回后重新提交。
5. **幂等执行**：执行入口先做状态 CAS（`pending → approved → executing`），只有拿到 `executing` 的调用才真正执行，重复点击不会重复上传。
6. **失败不自动重试**：失败写入申请日志与 `miniprogram_deployments`，需要重新提交申请（避免拿旧批准反复打生产）。
7. **环境未指定时跟随发布目标**：`environment` 留空表示「用发布目标自己配置的环境」（如 Admin 发布目标配的 `development`）。
   **不要默认成 `production`**——实测中该默认值会让每一次未显式指定环境的提交都失败在「尚未配置生产环境的 CloudBase 环境 ID」，
   而发布目标其实只用 development。数据库列是 `NOT NULL`，因此空值以空字符串存储，读取时还原为 `null`。
8. **发布记录必须留痕**：凭据/配置类失败也要写入 `miniprogram_deployments`（曾出现过在 `try` 之外解析凭据、
   导致失败只在申请上可见、发布历史上查无此单的情况）。

## 数据模型

新增迁移 `090_miniprogram_release_requests.sql`：

```sql
CREATE TABLE IF NOT EXISTS miniprogram_release_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  target ENUM('wechat_upload','cloudbase_static','cloudbase_hosted') NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'production',  -- 空串 = 跟随发布目标配置；见状态规则 7
  version VARCHAR(64) NULL,
  desc TEXT NULL,                      -- 提交说明（改名避免与保留字冲突）
  source_hash CHAR(64) NOT NULL,       -- 提交时的源码哈希，执行前复核
  status ENUM('pending','approved','executing','succeeded','failed','rejected','cancelled','expired') NOT NULL DEFAULT 'pending',
  requested_by CHAR(36) NOT NULL,      -- 申请人（人类或 Agent 会话）
  requested_by_kind VARCHAR(16) NOT NULL,  -- 'session' | 'agent'
  decided_by CHAR(36) NULL,            -- 批准/拒绝人
  decided_at TIMESTAMP(3) NULL,
  decision_note VARCHAR(512) NULL,     -- 拒绝理由或批准备注
  deployment_id CHAR(36) NULL,         -- 执行后关联的发布记录
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_release_pending (project_id, target, status),  -- 见下方说明
  KEY idx_release_project (project_id, created_at),
  CONSTRAINT fk_release_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

> 说明：`UNIQUE(project_id,target,status)` 能表达「同一目标同状态唯一」，但会连 `succeeded`/`failed` 也唯一，导致历史记录只能留一条。
> **因此不建这个唯一键**，改为在服务层用事务 + `SELECT ... FOR UPDATE` 保证同一目标同时只有一个 `pending`。迁移里只保留 `idx_release_project`。

审计沿用现有 `agent_events` 与 `miniprogram_deployments`；申请本身自带申请人/批准人/时间/理由，不引入新审计表。

## 接口

| 方法与路径                                                               | 权限          | 说明                                       |
| ------------------------------------------------------------------------ | ------------- | ------------------------------------------ |
| `POST /api/projects/:id/miniprogram/release-requests`                    | 成员（含 L3） | 提交申请，返回申请详情                     |
| `GET /api/projects/:id/miniprogram/release-requests`                     | 成员          | 列表（含状态、申请人、源码哈希是否已过期） |
| `GET /api/projects/:id/miniprogram/release-requests/:requestId`          | 成员          | 详情                                       |
| `POST /api/projects/:id/miniprogram/release-requests/:requestId/approve` | **owner**     | 批准并执行                                 |
| `POST /api/projects/:id/miniprogram/release-requests/:requestId/reject`  | **owner**     | 拒绝（需理由）                             |
| `POST /api/projects/:id/miniprogram/release-requests/:requestId/cancel`  | 申请人        | 撤回自己的申请                             |

L3 工具（`miniprogram_development` 能力内新增两个）：

- `miniprogram_submit_release` → 提交申请，返回申请 ID 与当前状态；**不执行发布**
- `miniprogram_release_status` → 查询自己申请的状态

现有的 `miniprogram_report_admin_preview` 等不变。**移除 `uploadMiniprogram` 里临时的 `confirm` 开关**，改由审批流统一表达授权。

## 界面

- **应用预览页签**：在微信发布区上方显示「待审批申请」卡片——目标、版本号、说明、申请人、提交时间、源码哈希是否已过期；owner 看到「批准并执行 / 拒绝」两个按钮，其他人只读；拒绝时弹出理由输入。
- **项目管理 → 小程序与云开发**：显示未处理申请数量，作为负责人进入的提示。
- 已处理的历史留在发布记录里，申请详情可从记录反查。

## 边界与失败处理

| 情况                                 | 行为                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 源码在申请后变更                     | 申请转 `expired`，执行前拒绝并提示重新提交                                                                      |
| 批准时目标已不存在（如环境配置被删） | 申请转 `failed`，日志记录原因                                                                                   |
| 同一目标已有 `pending`               | 409 + 已有申请 ID                                                                                               |
| 非 owner 调批准/拒绝                 | 403                                                                                                             |
| 申请人自我批准                       | L3 申请必须由 owner 批准；owner 自己发起的申请可以自批                                                          |
| 执行中进程崩溃                       | 申请停留在 `executing`；下次读取超过 30 分钟未更新则转 `failed`，提示可能已上传、请到微信后台核实（不自动重试） |
| 撤回后的申请                         | 终态，不可再批准                                                                                                |

## 已确认的决定

1. **全部走审批**：不再保留「owner 在界面直接上传」这条路径。owner 也要先提交申请再批准。
   现存的 `uploadMiniprogram` 临时 `confirm` 开关一并移除，授权只由审批流表达。
2. **允许 owner 自我批准**：符合当前单实例小团队定位。L3 发起的申请仍然只能由 owner 批准，
   L3 自己永远不能批准自己（或任何）申请。
3. **有效期 24 小时**：`pending` 超过 24 小时转 `expired`，需重新提交。

## 实现顺序（确认后执行）

1. 迁移 `090`：新建 `miniprogram_release_requests`（无唯一键，服务层事务保证单一 pending）。
2. `server/release-requests.js`：状态机与 CAS 转换、源码哈希复核、24 小时过期、审计字段。
3. 路由：提交 / 列表 / 详情 / 批准（即执行）/ 拒绝 / 撤回。
4. 移除 `uploadMiniprogram` 的 `confirm` 分支，改由审批流调用执行入口。
5. L3 工具：`miniprogram_submit_release`、`miniprogram_release_status`。
6. 界面：应用预览页签的「待审批申请」卡片 + 批准/拒绝（拒绝需理由）；项目管理显示待处理数量。
7. 测试：状态机全部合法/非法转换、源码变更导致 `expired`、重复 pending 409、非 owner 批准 403、
   owner 自批允许、L3 无法批准、幂等执行、失败不自动重试。
