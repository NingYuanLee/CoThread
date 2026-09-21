import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const port = Number(process.env.VITE_PORT || 3102);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFile = resolve(root, "vite.config.mjs");

const server = await createServer({
  configFile,
  root,
  server: {
    port,
    host: "127.0.0.1",
    strictPort: true,
    hmr: false,
  },
});

await server.listen();

const warmupUrls = ["/web/main.tsx", "/web/App.tsx"];
for (const url of warmupUrls) {
  await server.warmupRequest(url);
}

console.log(`Vite 已就绪：http://127.0.0.1:${port}`);
