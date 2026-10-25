import { test } from "node:test";
import assert from "node:assert/strict";
import { dialogueToolDenyReason } from "../server/agent-tools.js";

test("miniprogram mode rejects every CloudBase tool and still allows miniprogram reads", () => {
  for (const name of [
    "cloudbase_list_environments",
    "cloudbase_auth_config",
    "cloudbase_auth_config_update",
    "cloudbase_db_query",
    "cloudbase_db_manage",
    "cloudbase_db_write",
    "cloudbase_function_manage",
    "cloudbase_function_call",
    "cloudbase_function_logs",
    "cloudbase_storage_upload",
    "cloudbase_storage_manage",
  ]) {
    assert.match(dialogueToolDenyReason("miniprogram", name), /不能使用 CloudBase/);
  }
  assert.equal(dialogueToolDenyReason("miniprogram", "miniprogram_read_source"), null);
  assert.equal(dialogueToolDenyReason("default", "cloudbase_function_call"), null);
});

test("web search and fetch are only available during full scheduling", () => {
  assert.match(dialogueToolDenyReason("chat", "web_search"), /完整调度/);
  assert.match(dialogueToolDenyReason("miniprogram", "web_fetch"), /完整调度/);
  assert.match(dialogueToolDenyReason("cloudbase", "web_search"), /完整调度/);
  assert.equal(dialogueToolDenyReason("default", "web_search"), null);
  assert.equal(dialogueToolDenyReason("default", "web_fetch"), null);
});

test("chat mode rejects cloud function calls but still allows cloud reads", () => {
  assert.match(dialogueToolDenyReason("chat", "cloudbase_function_call"), /Chat 只读/);
  assert.equal(dialogueToolDenyReason("chat", "cloudbase_db_query"), null);
  assert.equal(dialogueToolDenyReason("chat", "cloudbase_function_logs"), null);
  assert.equal(dialogueToolDenyReason("chat", "cloudbase_list_environments"), null);
});
