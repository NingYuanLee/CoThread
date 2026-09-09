import { Sandbox } from "e2b";
import { acsOptions } from "../server/acs.js";
let sandbox;
try {
  sandbox = await Sandbox.create(
    process.env.E2B_TEMPLATE || "code-interpreter",
    acsOptions(),
  );
  const result = await sandbox.commands.run(
    'printf "ACS_CONNECTED\\n"; command -v node || true; command -v dsh || true',
    { timeoutMs: 20000 },
  );
  console.log({
    connected: true,
    exitCode: result.exitCode,
    hasNode: result.stdout.includes("/node"),
    hasDsh: result.stdout.includes("/dsh"),
  });
} catch (error) {
  console.error({
    connected: false,
    errorType: error.name,
    status: error.status ?? error.statusCode ?? null,
  });
  process.exitCode = 1;
} finally {
  if (sandbox) {
    try {
      await sandbox.kill();
      console.log("测试沙箱已回收");
    } catch {
      console.log("回收未确认，等待沙箱超时");
    }
  }
}
