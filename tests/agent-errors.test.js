import { test } from "node:test";
import assert from "node:assert/strict";
import { agentFailureCode } from "../server/agent-errors.js";

test("runtime diagnostics identify missing dependencies without leaking raw errors", () => {
  assert.equal(agentFailureCode(new Error("Cannot find package '@deepseek-ai/dsh-sdk-protocol' imported from /private/runtime")), "DSH_MISSING_DEPENDENCY:@deepseek-ai/dsh-sdk-protocol");
  assert.equal(agentFailureCode(Object.assign(new Error("password=secret; prompt=private"), { agentStage: "start" })), "DSH_START_FAILED");
  assert.equal(agentFailureCode(new Error("Cannot find module '/private/secret/key.js'")), "DSH_MISSING_DEPENDENCY");
  assert.equal(agentFailureCode(Object.assign(new Error("private"), { agentStage: "secret" })), "DSH_CONTEXT_FAILED");
});
