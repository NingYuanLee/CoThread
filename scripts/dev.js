import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const portIndex = process.argv.indexOf("--port");
if (portIndex >= 0) {
  const { createServer } = await import("vite");
  const server = await createServer({
    server: { port: Number(process.argv[portIndex + 1]), host: "127.0.0.1", strictPort: true },
  });
  await server.listen();
} else {
  const uiPort = Number(process.env.PORT || 3100);
  const deps = spawnSync(process.execPath, [resolve(projectRoot, "scripts/ensure-vite-deps.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (deps.status !== 0) process.exit(deps.status ?? 1);

  const child = spawn(
    process.execPath,
    ["--env-file=.env", "server/index.js"],
    {
      env: {
        ...process.env,
        PORT: String(uiPort),
        HOST: process.env.HOST || "127.0.0.1",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
}
