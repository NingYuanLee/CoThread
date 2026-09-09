import { createMakersApp } from "../server/makers.js";

// Makers invokes this Express app; do not listen or start a polling worker here.
// Makers embeds this module in a per-request IIFE. Module-level variables alone
// therefore do not survive requests, even in a warm process. Retain the whole
// app so its pool, initialization promise and request timing context stay paired.
const appKey = Symbol.for("cothread.makers.http-app.v1");
const app = globalThis[appKey] ??= createMakersApp();
export default app;
