import { Sandbox } from "e2b";
import { acsOptions } from "../server/acs.js";
let sandbox;
try {
  sandbox = await Sandbox.create(
    process.env.E2B_TEMPLATE || "code-interpreter",
    { ...acsOptions(), timeoutMs: 600000 },
  );
  const version = await sandbox.commands.run(
    "node --version && npm --version",
    { timeoutMs: 20000 },
  );
  console.log("ACS runtime:", version.stdout.trim());
  console.log("Installing official DSH package into disposable ACS sandbox...");
  const install = await sandbox.commands.run(
    "npm install --prefix /home/user/.local/cothread-dsh --registry=https://registry.npmjs.org --no-audit --no-fund @deepseek-ai/dsh@0.1.2-rc.1",
    { timeoutMs: 240000 },
  );
  console.log("DSH install exit:", install.exitCode);
  const check = await sandbox.commands.run(
    "/home/user/.local/cothread-dsh/node_modules/.bin/dsh --profile headless --help",
    { timeoutMs: 60000 },
  );
  console.log("DSH help exit:", check.exitCode);
} catch (error) {
  console.error({
    stage: "DSH check",
    errorType: error.name,
    exitCode: error.exitCode ?? null,
  });
  process.exitCode = 1;
} finally {
  if (sandbox) {
    try {
      await sandbox.kill();
      console.log("DSH test sandbox released");
    } catch {
      console.log("Sandbox will expire");
    }
  }
}
