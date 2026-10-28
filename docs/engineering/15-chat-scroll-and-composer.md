# 会话滚动与底栏高度

群聊与「问老翁」单聊共用一个会话舞台结构。这里记的是：谁在滚、底栏高度怎么量、以及分栏重建时为什么曾经坏过。

## 结构

- 消息列表：`.conversation-stage > .conversation`（`overflow-y: auto`），内容块是 `:scope > .conversation-stream`。
- 输入区：`.composer-area`，绝对定位盖在消息上方，自身 `pointer-events: none`、子元素恢复；磨砂渐变与滚动条让位都靠它在 stage 上写变量实现。
- stage 上两个自定义属性：
  - `--composer-height`：底栏实际高度；
  - `--chat-scrollbar`：纵向滚动条占用宽度。
- 读这两个属性的地方：`.conversation` 的 `padding-bottom`（高度 + 16px）、`.composer-area` 的 `right`、`.message-navigator` 的 `bottom`、`.scroll-to-latest` 的 `bottom`。

## 谁在写

- 群聊：`web/use-composer-stage.ts`，由 `WorkspaceApp` 调用（ref 由它创建后传给 `ConversationStage`）。
- 单聊：同一 hook 由 `ElderChat` 直接调用。

每次同步都按 ref 重新定位当前的 `.composer-area` 与它最近的 `.conversation-stage`，再写两个属性。

## 无迭代时的分栏

项目还没有迭代也能打开「问老翁」：左列是欢迎页（`WorkspaceWelcome`），没有 `.conversation-stage`，hook 找不到底栏就保持两个变量为空，不会残留旧值。头部在分栏态必须把三个子元素按列显式落位（会话视图组第 1 列、拖拽条第 2 列、老翁控件第 3 列）；无迭代时第 1 列不存在，靠自动排布会把拖拽条顶到列 1、把老翁控件挤进 0.071rem 宽的隔条列，表现为「单聊 / 轨迹 / 问老翁」竖排换行。

左列点「新迭代」或在欢迎页点「发起新迭代」都会打开新迭代弹窗（`NewThreadDialog`），提交成功后会话切到新迭代、stage 才挂上，hook 会随 `.main` 子树变化重新测量，行为与有迭代时一致。欢迎页主按钮下方的「先问问老翁」与头部「问老翁」共用同一个 `elderOpen` 开关。

## 分栏重建的坑

点「问老翁」时 React 会把 `conversation-body > ConversationStage` 整棵换成 `conversation-split > conversation-split-left > conversation-body > ConversationStage`，DOM 是新建的；而 hook 挂在不会重挂的 `WorkspaceApp` 上，effect 不会重跑。

旧实现只在挂载时抓一次 stage 元素，重建后新 stage 上没有任何人写 `--composer-height`，CSS 回退到 `0px`：底栏（实际 200+ px）直接压住最后几条消息，`padding-bottom` 也退回到 16px，可滚动空间几乎消失——表现就是「消息被挡住、滚不上去」。关闭分栏时同理再坏一次。

现在的做法：

- 每次 sync 都按 `composerRef.current` 重新找 stage，不缓存元素；
- 观察不随分栏变化的 `.main` 子树 childList 变化，节点被换掉后重新测量；
- `ResizeObserver` 同时盯底栏与会话容器，底栏换上新的节点后自动改观察目标；
- 轨迹视图或底栏暂不在时清空变量，避免留下旧值继续压内容。

## 贴底与「回到最新」

- `useStickToBottom`：跟随开启时贴底；用户主动离开底部（滚轮、触摸、拖滚动条、翻页键）后不再拽回。内容或底栏高度变化会再贴一次。
- `useAtBottom`：只读地给出「是否在底部」，阈值与贴底逻辑一致（100px），供按钮显隐。
- `ScrollToLatest`：绝对定位在底栏上方 10px，出现/消失不改变布局，因此不会反过来影响底栏高度；点击时把跟随状态置回 true 并滚到最底。

## 验收

界面类改动按实机验证，不以读代码代替：

1. 登录后在有足够消息的会话里用滚轮上翻：输入框上方浮出「回到最新」，与底栏顶部间距 10px；点击后回到最底，按钮消失。
2. 点「问老翁」进入分栏：群聊 stage 的 `--composer-height` 应等于底栏实际高度（不再是 `0px`）、`.conversation` 的 `padding-bottom` 不再回落到 16px、最后一条消息不被 `.composer-area` 覆盖；关闭分栏再查一次。
3. 单聊侧上翻同样出现按钮；两栏各自独立滚动、互不牵连。
4. 门禁：`npx tsc --noEmit` 与 `npm run lint`。
