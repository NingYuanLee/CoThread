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
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const failed = await onRequest({ request: new Request('https://example.test/cothread-agent', {
      method: 'POST', headers: { 'Makers-Conversation-Id': 'ede432bd-69c1-4a65-924d-c50aec6999dc' }, body: '{}'
    }) });
    const detail = await failed.json();
    if (failed.status !== 500 || detail.code !== 'INIT_ENCRYPTION_KEY') throw new Error('Missing safe initialization diagnostic');
    if (Object.keys(detail).sort().join(',') !== 'code,error') throw new Error('Unexpected diagnostic fields');
    const { makersErrorDetails } = await import(${JSON.stringify(new URL("../server/makers.js", import.meta.url).href)});
    if (Object.keys(makersErrorDetails({ initializationCode: 'secret', message: 'secret' })).length) throw new Error('Unknown diagnostic leaked');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
