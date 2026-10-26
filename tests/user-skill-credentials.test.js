import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertMiaowenToken } from "../server/user-skill-credentials.js";
import { miaowenChildEnv, runMiaowenChat } from "../server/miaowen-skill.js";

test("妙问 API KEY 必须是 sk-mw- 开头，且未配置时不写用户主目录", async () => {
  assert.equal(assertMiaowenToken("sk-mw-abc_DEF-1234"), "sk-mw-abc_DEF-1234");
  assert.throws(() => assertMiaowenToken("secret"), /sk-mw-/);
  const home = join(tmpdir(), "miaowen-account-home");
  const env = miaowenChildEnv(home, { PATH: "kept" });
  assert.equal(env.HOME, home);
  assert.equal(env.USERPROFILE, home);
  assert.equal(env.PATH, "kept");
  const missing = await runMiaowenChat({ query: "开户流程" }, "");
  assert.match(missing.text, /TOKEN_NOT_FOUND/);
  assert.match(missing.text, /技能设置/);
});
