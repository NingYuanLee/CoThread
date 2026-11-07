# 前端包体积与图标

## 文件类型图标

文件类型图标由 `web/ui-file-icons.tsx` 提供，项目自持实现，不再依赖第三方图标包。

- 5 个原图标（文档页、Markdown、笔记本、Python、文本）按原样保留，SVG 取自 @react-symbols/icons 的构建产物（MIT，Copyright (c) 2022 Pablo Hernández），文件头已注明许可。
- 其余类别图标为项目自绘，风格与 `web/ui-icon.tsx` 内的 Lucide 内联 SVG 一致（ISC，https://lucide.dev）。
- 扩展名与文件名的解析规则不变：优先最长复合扩展名（`d.ts`、`env.example`），其次最后一段扩展名；完整文件名命中优先于扩展名。同一类文件拿到同一个图标。

原先为这 5 个图标引入了 @react-symbols/icons，它的 files chunk 单文件 535 KB、内联 650 个品牌 SVG，构建产物里多出一个 463 KB 的 chunk。移除后该 chunk 降到 26 KB（gzip 6.5 KB），chunk 内 SVG path 从 870 处降到 39 处。

## 实测

2026-11-06 构建对比：

| 指标         | 改前                       | 改后                    |
| ------------ | -------------------------- | ----------------------- |
| 图标 chunk   | 463.12 kB / gzip 147.40 kB | 26.31 kB / gzip 6.47 kB |
| dist 总体积  | 12.70 MiB                  | 12.29 MiB               |
| dist JS 总量 | 11.32 MiB                  | 10.91 MiB               |

最大 chunk 未变：`elk` 1,512.81 kB，属 mermaid 的依赖，由文档预览的流程图渲染按需加载，不在工作台首屏链路上。

## 映射等价性

新旧实现用同一批文件名对跑：409 条扩展名键 + 743 条完整文件名键 + 边界用例共 1575 条，0 处不一致；再按 document-icons、ChatComposer、仅微信三套生产覆盖表各跑 1169 条，同样 0 处不一致。

## 2026-11-07 的两处缩减

**Markdown 解析器移出首屏。** `web/MarkdownDocumentPreview.tsx` 原本静态 import `react-markdown` 与 `remark-gfm`，把 micromark/remark/rehype 解析器（约 170 KB）挂进工作台首屏的静态依赖图。改为按需加载后，`MarkdownDocumentPreview` chunk 从 178.9 KB 降到 13.6 KB；含 micromark 的两个 chunk 只被 `MarkdownDocumentPreview`、`MessageMarkdown`、`QuoteMarkdown` 引用，入口 chunk 不再引用它们——解析器已完全离开首屏路径。

**清掉无引用的业务样式。** `web/workspace.css` 从 673,760 字节降到 569,923 字节（-15.4%）：删除 588 条类名在全仓无引用的规则，并清掉 38 个本来就存在的空 `@media`/`@supports` 块。判定口径是「类名 token 在代码里无引用」，动态拼接的类名逐个枚举取值后确认——`admin-project-role-{member,project_admin,project_leader,viewer}`、`mcp-access-{read,write}`、`permission-menu`、`slide-switch-{dense,compact}`、`tip-{error,info,success,warning}` 均在用，已保留。生产构建产物里共享 CSS chunk 从 475,039 字节降到 405,617 字节（-14.6%），其余 CSS 产物未变。

验证方式：登录页、工作台首屏、项目记忆面板、管理空间四页在同一代码树下前后各截一次图，两套截图的 SHA-256 完全一致；剩余 3,173 条规则逐条能在原文件中找到原文，无新增或改写。

## 管理空间与工作台样式解耦

`web/workspace.css` 原来被 `web/WorkspaceApp.tsx` 与 `web/AdminApp.tsx` 同时静态 import，Vite 只能把两份合成一个共享 chunk（`DialogFilters-*.css`，463.9 KiB），管理空间因此要下载整套工作台样式。

现在按「每条规则只存在于一个文件」拆成三份：

| 文件                       | 内容                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `web/workspace.css`        | 工作台专属规则（2,374 条，419,726 字节）                       |
| `web/shared-workspace.css` | 管理空间与工作台**共用**规则，唯一来源（806 条，136,056 字节） |
| `web/admin.css`            | 管理空间专属规则（60 条，13,427 字节）                         |

拆分的依据是**层叠顺序就是优先级**。只有「同选择器命中同一元素 + 同属性 + 同特异性」的规则对，才会因先后变化而改变结果；不同属性、不同特异性、选择器不重叠的规则，先后无所谓。

做法：先按上述口径建冲突关系（静态扫描 3,210 对，再用真实 DOM 补齐「不同类但同元素」的关系，共 3,256 对有效冲突），有冲突的规则绑成组不可拆；再按「只被工作台用 / 只被管理空间用 / 两边都用」把组分派到三个文件，组内保持拆分前的先后。

一处需要特别说明：`web/shared-workspace.css` 里的 `.admin-account-avatar` 原本与通用的 `.avatar` 抢同一元素（静态同类扫描看不到，是 DOM 级对比抓出来的）。它在拆分前排在 `.avatar` 之前、因此输给通用规则；管理空间当时生效的是 `admin.css` 里另一份完全相同的副本（排在 `.avatar` 之后所以赢）。零重复后只剩一份，改放 `admin.css`（它本来就只被管理空间使用），由加载顺序 `shared → admin` 自然排在 `.avatar` 之后，恢复原样。

门禁 `scripts/check-css-order.mjs` 守住两条不变式：① 跨文件重复规则数必须为 0；② 覆盖关系对（记录在 `scripts/css-order-manifest.json`，含拆分前的先后）必须在同一文件内且先后不变。已接入 `npm run lint`。

产物收益：原先的共享 chunk 消失，变成 `WorkspaceApp-*.css` 395.32 KiB（工作台专属）与 `AdminApp-*.css` 106.85 KiB（管理空间专属）。管理空间首屏 CSS 从 609,936 字节降到 284,213 字节（-53%），入口的依赖组里不含工作台 CSS；工作台不再加载 `admin.css`。

本文件只写已确认的现行行为。
