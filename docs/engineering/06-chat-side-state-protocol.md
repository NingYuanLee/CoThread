# 聊天侧表快照指纹协议（s1）

日期：2026-10-17。本协议减少侧表未变时的重复传输；服务端仍读取数据库并计算快照指纹，不是行级变更日志，也不减少当前 SQL 数量。

## 请求与响应

仅浏览器聊天显式启用：

```text
GET /api/threads/:id?view=chat&sideState=initial
GET /api/threads/:id?view=chat&after=:messageSequence&sideState=:token
```

不传 sideState 的请求沿用完整侧表快照。view=full 忽略该参数；Service 默认和 MCP 默认读取不启用协议。

启用后响应增加：

```json
{ "sideState": { "mode": "snapshot", "token": "s1:<43个base64url字符>" } }
```

首次读取、指纹不同或未知版本都返回 mode=snapshot，包含原来的完整集合。以下六个集合参与指纹：reviews、runs、replies、updates、requests、localExecutorTasks。

当请求 token 与当前快照匹配时，返回 mode=unchanged；六个集合均用空数组占位。**这时空数组表示沿用本地快照，不能作为删除集合处理。** messages、events、contextUsage、消息分页、未读状态和迭代元数据仍按原规则返回。

token 是上述完整集合及用户 ID、凭据类型/项目作用域、迭代 ID、结果投影选项的 SHA-256 指纹。它不编码时间或单调版本，也不是访问凭据。每次请求均先执行正常鉴权、项目成员资格和迭代权限检查。

## 更新、删除和失效

任一集合中的字段改变或记录删除都会改变指纹，下一次返回完整新快照。客户端用这个完整快照替换侧表，因此可正确处理旧任务完成、重试、用量更新和删除，即使消息 after 完全不变。

客户端只有在仍持有同一迭代、同一 token 的完整快照时才能接受 unchanged。缺失、错配或不认识的本地状态必须以 sideState=initial 重同步，不能显示服务端的占位空数组。

当前 readThreadPages 在每个请求中固定其基准对象；协议错配最多重试一次完整快照。跨页追赶保留服务端消息游标，未变侧表仍使用已验证快照。最终与最新本地消息窗口合并，旧请求是否允许写回仍由原资源缓存的请求身份机制判断。

## 客户端缓存约束

侧表按不可变值使用。本地变更通过 WorkspaceApp 的 updateThreadCache 清除 sideState，下一次重新取得完整快照。共享合并模块另以 WeakMap 记录收到 token 时的迭代、集合引用及长度，拒绝未登记、替换集合或更改长度后的 token；这个检查不负责检测任意嵌套字段的原地修改。

不要单独持久化 token、丢失实际集合后仍发送它。消息/read-receipt 等不改变侧表的更新可以沿用快照。历史分页合并不回退前向消息游标；乐观消息不能代替服务端分页推进游标。

threadPollKey 纳入 token，因此仅 usage_stats 等侧表字段变化也会触发界面更新，不依赖状态或消息变化。

## 验证与边界

数据库回归：`tests/chat-side-token.test.js`、`tests/chat-side-state.test.js`；纯协议回归：`tests/thread-side-state.test.js`、`tests/thread-side-projection.test.js`。隔离浏览器入口和成对测量见持续评审记录第十三阶段。

本协议沿用当前多条读取形成快照的语义，没有额外提供跨 SQL 的事务快照或每次中间状态都能被观察的保证。变化的快照仍完整传输；若要进一步减少数据库扫描和频繁变化时的载荷，需要持久变更游标、删除标记、所有写入路径的事务覆盖以及独立测量。
