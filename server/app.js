import { createApp as createHttpApp } from "./http-app.js";
import { executeRun } from "./sandbox-run.js";
import { stopAgent } from "./agent.js";
import { resolveSandboxProvider } from "./sandbox-provider.js";

export function createApp(db, options = {}) {
  // 沙箱 provider 配错要在启动时暴露，而不是等到第一次执行任务。
  resolveSandboxProvider(options.sandboxProvider);
  return createHttpApp(db, { executeRun, stopAgent, ...options });
}
