import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    // middlewareMode 下开启会在部分环境导致首请求长时间挂起；独立 Vite 进程可预转换。
    preTransformRequests: false,
    warmup: {
      clientFiles: [
        "./web/main.tsx",
        "./web/App.tsx",
        "./web/WorkspaceApp.tsx",
        "./web/BootScreen.tsx",
        "./web/LoginScreen.tsx",
      ],
    },
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
    entries: ["./index.html", "./web/main.tsx", "./web/WorkspaceApp.tsx"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-markdown",
      "remark-gfm",
      "jszip",
      "xlsx",
      "docx-preview",
      "mermaid",
      "@react-symbols/icons/utils",
      "@react-symbols/icons/files",
    ],
  },
});
