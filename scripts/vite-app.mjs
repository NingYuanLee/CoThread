import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveDevPorts } from "./dev-runtime.js";
import { LISTEN_HOST } from "../server/runtime-config.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { uiPort, vitePort } = resolveDevPorts(process.env);

const server = await createServer({
  configFile: resolve(projectRoot, "vite.config.mjs"),
  root: projectRoot,
  server: {
    port: vitePort,
    host: LISTEN_HOST,
    strictPort: true,
    hmr: { host: "127.0.0.1", clientPort: uiPort },
  },
});

const guardBusyWatch = () => {
  const watcher = server.watcher;
  if (!watcher || watcher.listenerCount("error") > 0) return;
  watcher.on("error", (error) => {
    if (error?.code === "EBUSY" || error?.code === "EPERM") {
      console.warn(`忽略被占用的监听路径：${error.path || error.filename || error.message}`);
      return;
    }
    throw error;
  });
};
guardBusyWatch();
await server.listen();
guardBusyWatch();
console.log(`Vite 已启动：http://127.0.0.1:${vitePort}（浏览器经 ${uiPort}）`);
