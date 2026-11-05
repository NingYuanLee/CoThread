import { createApp as createHttpApp } from "./http-app.js";
import { executeRun } from "./sandbox-run.ts";
import { stopAgent } from "./agent.js";
import { resolveSandboxProvider } from "./sandbox-provider.ts";
import type { Db } from "./types.ts";

/** 应用层可注入的选项。 */
type CreateAppOptions = {
  sandboxProvider?: unknown;
  [option: string]: unknown;
};

/** 启动参数：先校验 provider 配置，再把执行入口交给 HTTP 层。 */
export function createApp(db: Db, options: CreateAppOptions = {}) {
  // 沙箱 provider 配错要在启动时暴露，而不是等到第一次执行任务。
  resolveSandboxProvider(options.sandboxProvider);
  return createHttpApp(db, {
    executeRun,
    stopAgent,
    ...options,
  } as unknown as Parameters<typeof createHttpApp>[1]);
}
