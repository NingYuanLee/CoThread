# 前端包体积与图标

## 文件类型图标

文件类型图标由 `web/ui-file-icons.tsx` 提供，项目自持实现，不再依赖第三方图标包。

- 5 个原图标（文档页、Markdown、笔记本、Python、文本）按原样保留，SVG 取自 @react-symbols/icons 的构建产物（MIT，Copyright (c) 2022 Pablo Hernández），文件头已注明许可。
- 其余类别图标为项目自绘，风格与 `web/ui-icon.tsx` 内的 Lucide 内联 SVG 一致（ISC，https://lucide.dev）。
- 扩展名与文件名的解析规则不变：优先最长复合扩展名（`d.ts`、`env.example`），其次最后一段扩展名；完整文件名命中优先于扩展名。同一类文件拿到同一个图标。

原先为这 5 个图标引入了 @react-symbols/icons，它的 files chunk 单文件 535 KB、内联 650 个品牌 SVG，构建产物里多出一个 463 KB 的 chunk。移除后该 chunk 降到 26 KB（gzip 6.5 KB），chunk 内 SVG path 从 870 处降到 39 处。

## 实测

2026-11-06 构建对比：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 图标 chunk | 463.12 kB / gzip 147.40 kB | 26.31 kB / gzip 6.47 kB |
| dist 总体积 | 12.70 MiB | 12.29 MiB |
| dist JS 总量 | 11.32 MiB | 10.91 MiB |

最大 chunk 未变：`elk` 1,512.81 kB，属 mermaid 的依赖，由文档预览的流程图渲染按需加载，不在工作台首屏链路上。

## 映射等价性

新旧实现用同一批文件名对跑：409 条扩展名键 + 743 条完整文件名键 + 边界用例共 1575 条，0 处不一致；再按 document-icons、ChatComposer、仅微信三套生产覆盖表各跑 1169 条，同样 0 处不一致。

本文件只写已确认的现行行为。