# 静态资源传输与构建产物

生产由 Node 直接托管 `dist/`，没有反向代理做压缩，构建产物必须在构建期就备好压缩版本。

## 预压缩

`npm run build` 在 `vite build` 之后执行 `node scripts/precompress-assets.mjs dist`，为 `dist/` 下文本类资源（html/css/js/json/svg/xml/txt/map/webmanifest，1 KiB 以上）产出同名的 `.br` 与 `.gz` 兄弟文件。brotli 用最高压缩级别并带 size hint，gzip 用 `Z_BEST_COMPRESSION`。

`server/static-compression.ts` 的 `precompressedStatic` 中间件在 `express.static` 之前挂载，按请求的 `Accept-Encoding` 发送对应文件：

- 同时接受 br 和 gzip 时按 q 值比较择优，不无条件优先 br；客户端显式降级（`br;q=0`）时照办。
- 预压缩文件不存在、或不比原文件新（说明没跟上这次构建）时退回原文件。
- 命中压缩分支时带 `Content-Encoding` 与 `Vary: Accept-Encoding`，并沿用与 `express.static` 一致的缓存头：`/assets/` 下的文件是 `public, max-age=31536000, immutable`，其余是 `no-store`。
- 路径越出 `dist/` 的请求不命中任何文件。

单独执行预压缩：`npm run precompress`。改了 `dist/` 内容但没重新构建时，先跑这条再重启服务。

## 缓存

`dist/assets/` 下的文件带内容哈希，按 `public, max-age=31536000, immutable` 缓存一年；`index.html` 与 SPA 回退路由是 `no-store`。

## 实测

2026-11-06 在本机测量：构建产物原始 13.3 MB，gzip 后 3.8 MB，brotli 后 3.7 MB。首屏关键资源（475 KB CSS、284 KB 入口 JS、463 KB 图标 chunk、index.html）合计 1,225,499 字节走 brotli 后为 257,548 字节，减少 79%。

在最终构建上按「最大几个产物」复测：elk 1,512,810 → 355,204、mermaid.core 670,578 → 136,638、cynefin 654,413 → 115,949、475 KB CSS → 54,159、index.html 2,839 → 930，合计 3,315,679 → 662,880 字节，减少 80%。

预压缩只对文本类资源生效；二进制与空文件跳过，压缩后不比原文件小的也不产出产物。

本文件只写已确认的现行行为。
