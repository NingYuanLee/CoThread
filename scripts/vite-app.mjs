import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveDevPorts } from "./dev-runtime.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { uiPort, vitePort } = resolveDevPorts(process.env);
const host = process.env.HOST || "127.0.0.1";

const server = await createServer({
  configFile: resolve(projectRoot, "vite.config.mjs"),
  root: projectRoot,
  server: {
    port: vitePort,
    host,
    strictPort: true,
    hmr: { host: "127.0.0.1", clientPort: uiPort },
  },
});

await server.listen();
console.log(`Vite 已启动：http://127.0.0.1:${vitePort}（浏览器经 ${uiPort}）`);
