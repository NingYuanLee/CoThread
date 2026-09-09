import { createApp as createHttpApp } from "./http-app.js";
import { executeRun } from "./acs.js";
import { stopAgent } from "./agent.js";

export function createApp(db, options = {}) {
  return createHttpApp(db, { executeRun, stopAgent, ...options });
}
