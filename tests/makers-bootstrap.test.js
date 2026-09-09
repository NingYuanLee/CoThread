import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Agent entry can boot without loading the DSH execution SDK", () => {
  const entry = new URL("../agents/cothread-agent/index.js", import.meta.url).href;
  const script = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === '@deepseek-ai/dsh-sdk-client') throw new Error('Execution SDK must not load during HTTP startup');
      return next(specifier, context);
    }});
    const { onRequest } = await import(${JSON.stringify(entry)});
    const response = await onRequest({ request: new Request('https://example.test/cothread-agent') });
    if (response.status !== 405) throw new Error('Entry did not start');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
