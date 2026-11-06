# 文档放哪

这里只说明文档分三处。项目是什么、代码在哪、怎么启动，看仓库根 [README.md](../README.md)。

| 读者           | 位置                                    | 放什么                                                                                     |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| 使用者         | [public/docs.html](../public/docs.html) | 使用手册：功能与运转规则。网站地址是 `/docs.html`。安装和部署看仓库 README 与 engineering/ |
| 改代码的 Agent | [engineering/](engineering/)            | 行为、契约、运行边界。不要删除这个文件夹                                                   |
| 做这个产品的人 | [product/](product/)                    | 这整个产品的资料。不是业务里的项目文档库                                                   |

改代码的 Agent：项目有相关新增或改动，且行为、契约或运行边界变了，就更新 `engineering/` 里对应的文档。说明文件有新增、重命名或删除时，同时改下面的目录。

工程说明：

- [01-architecture.md](engineering/01-architecture.md)：协作结构、存储、Agent 成员、共享插件和沙箱边界
- [02-iteration-archive.md](engineering/02-iteration-archive.md)：归档状态机和接口
- [03-admin-platform.md](engineering/03-admin-platform.md)：管理空间页面和权限
- [04-miniprogram-release-approval.md](engineering/04-miniprogram-release-approval.md)：小程序生产发布审批
- [05-cloud-environment.md](engineering/05-cloud-environment.md)：云端环境变量、ECS 发布流程、故障恢复与验收要求
- [releases/](engineering/releases/)：逐次发布记录，按发布日期一个文件，只放当轮事实，不回流成流程
- [06-chat-side-state-protocol.md](engineering/06-chat-side-state-protocol.md)：聊天侧表快照指纹
- [07-request-timing.md](engineering/07-request-timing.md)：接口耗时怎么读
- [08-security-dependencies.md](engineering/08-security-dependencies.md)：有意保留的依赖风险

- [08-feedback-tips.md](engineering/08-feedback-tips.md)：统一提示、撤销与反馈行为
- [09-dialogs-and-overlays.md](engineering/09-dialogs-and-overlays.md)：弹窗与浮层约定
- [10-theme-system.md](engineering/10-theme-system.md)：主题与生成产物
- [11-agent-prompt-context.md](engineering/11-agent-prompt-context.md)：六段提示词、来源模式、持久会话及调用预览的改造契约（实现与验收状态见正文）
- [12-project-memory.md](engineering/12-project-memory.md)：项目记忆（老翁持续整理、双区条目、迭代清算、全屏弹窗入口）的实现契约
- [13-laoweng-workloads.md](engineering/13-laoweng-workloads.md)：老翁的工作面、五类维护任务、项目记忆写入场景、调度与接口
- [14-project-memory-usability.md](engineering/14-project-memory-usability.md)：项目记忆可用性评估（走查结论、已知限制与待验项）
- [15-chat-scroll-and-composer.md](engineering/15-chat-scroll-and-composer.md)：会话滚动、底栏高度契约与「回到最新」按钮
- [16-conversation-memory-design.md](engineering/16-conversation-memory-design.md)：关键发言与核心议题的联合分析（窗口、候选、待观察问题与重核）
- [17-file-index-design.md](engineering/17-file-index-design.md)：文件索引（根索引、单文件索引、关联索引）、识别队列与提取策略
- [18-project-process-design.md](engineering/18-project-process-design.md)：项目进程条目与每项目一份的项目现状正文
- [19-memory-upgrade-review.md](engineering/19-memory-upgrade-review.md)：记忆作业升级的缺陷修复台账与验证记录
- [20-memory-source-lifecycle-plan.md](engineering/20-memory-source-lifecycle-plan.md)：按来源治理记忆（两态、三来源、出处固定与检索）
- [21-document-preview-renditions.md](engineering/21-document-preview-renditions.md)：旧版 Office（OLE2）预览派生文件的生成与失效
- [22-server-typescript-migration.md](engineering/22-server-typescript-migration.md)：server/ 迁到 TypeScript 的运行方式、语法约束、转换工具与进度
- [23-static-asset-delivery.md](engineering/23-static-asset-delivery.md)：生产静态资源预压缩、编码协商与缓存策略
- [24-database-query-merging.md](engineering/24-database-query-merging.md)：首屏与迭代上下文的查询合并口径、连接池上限依据与实测
- [25-frontend-polling.md](engineering/25-frontend-polling.md)：前端定时轮询的统一约定与标签页可见性行为
- [26-test-execution.md](engineering/26-test-execution.md)：测试调度策略、固定等待用例的并发化与 DSH runtime 超时
- [27-frontend-bundle-size.md](engineering/27-frontend-bundle-size.md)：前端文件类型图标的来源、解析规则与包体积实测

用户能看见的行为变了，同时改 `public/docs.html` 和对应的工程说明。只改内部实现时只改工程说明。表结构以 `migrations/` 为准。长期产品资料放进 `product/`。一次测量、复盘或待办不要留在 `docs/`。

产品资料：

- [knowledge-base-plan.md](product/knowledge-base-plan.md)：知识库总计划。只定范围和顺序，不是已上线行为。
