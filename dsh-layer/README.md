# dsh-layer

共序加在官方 DSH 上的定制层。官方包 `@deepseek-ai/dsh` 不在这里改。

思考循环仍是官方 `DeepSeekHarness`，由 [server/agent.js](../server/agent.js) 启动 L2 和子 Agent，由 [server/l1-agent.js](../server/l1-agent.js) 启动 L1。本目录里的文件不会自己思考。

[server/dsh-runtime-config.js](../server/dsh-runtime-config.js) 先取官方 `sdk-minimal`，再叠下面的装配单和插件。

## 文件

装配单：

- `agent-patch.yml`：L2 与子 Agent
- `l1-agent-patch.yml`：L1

共序插件：

- `cothread-tools.mjs`：项目工具桥
- `l1-tools.mjs`：L1 禁止调用工具
- `cothread-system-prompt.mjs`：按层级注入角色
- `cothread-skills.mjs`：注入数据库 Skill
- `cothread-visual-verification.mjs`：注入视觉验收要求
- `sdk-resume.mjs`：固定版本 SDK 的会话续接
- `cothread-plugin-registry.mjs`：插件清单和各层提示词正文

插件用的辅助模块：

- `repair-context.mjs`：修补旧上下文
- `context-meter.mjs`：计量上下文

行为、契约和运行边界以 [docs/engineering/](../docs/engineering/) 为准，不在这里再写一套。
