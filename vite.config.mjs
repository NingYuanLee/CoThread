import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // middlewareMode 下开启会在部分环境导致首请求长时间挂起
    preTransformRequests: false,
    fs: { deny: [".local"] },
    watch: {
      ignored(path) {
        const normalized = path.replaceAll("\\", "/").toLowerCase();
        return ["/.git/", "/.local/", "/dist/", "/node_modules/"].some((part) => normalized.includes(part));
      },
    },
  },
  optimizeDeps: {
    holdUntilCrawlEnd: false,
    entries: ["./index.html", "./web/main.tsx"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react-markdown",
      "remark-gfm",
    ],
  },
});
