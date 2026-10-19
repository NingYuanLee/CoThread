import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  registerSandboxProvider,
  resolveSandboxProvider,
  formatSandboxReference,
  parseSandboxReference,
} from "../server/sandbox-provider.js";
import { LocalSandbox } from "../server/local-sandbox.js";
import { acquireSandbox, releaseSandbox } from "../server/agent-sandbox.js";
function factory() {
  const live = new Map();
  let created = 0,
    killed = 0,
    failKill = false,
    failConnect = false;
  const provider = {
    create: async () => {
      created++;
      const sandbox = {
        sandboxId: `opaque-${created}`,
        files: { makeDir: async () => {} },
        setTimeout: async () => {},
        kill: async () => {
          if (failKill) throw new Error("network offline");
          killed++;
          live.delete(sandbox.sandboxId);
        },
      };
      live.set(sandbox.sandboxId, sandbox);
      return sandbox;
    },
    connect: async (id) => {
      if (failConnect) throw new Error("network offline");
      const s = live.get(id);
      if (!s) throw new Error("not found");
      return s;
    },
  };
  registerSandboxProvider(`qa-${randomUUID().slice(0, 8)}`, provider);
  return {
    provider,
    live,
    get created() {
      return created;
    },
    get killed() {
      return killed;
    },
    failKill: (v) => (failKill = v),
    failConnect: (v) => (failConnect = v),
  };
}
function database(reference = null) {
  let saved = reference,
    failWrite = false;
  return {
    get reference() {
      return saved;
    },
    setReference: (v) => (saved = v),
    failWrite: (v) => (failWrite = v),
    async execute(sql, params) {
      if (sql.startsWith("SELECT")) return [[{ sandbox_id: saved }]];
      if (failWrite) throw new Error("database offline");
      if (sql.includes("sandbox_id=NULL")) {
        if (saved === params[1]) saved = null;
        return [{ affectedRows: 1 }];
      }
      if (saved !== params[2]) return [{ affectedRows: 0 }];
      saved = params[0];
      return [{ affectedRows: 1 }];
    },
  };
}

test("persistent provider contract validates recovery and prevents replacing local", () => {
  assert.throws(
    () => registerSandboxProvider("missing-connect", { create: async () => {} }),
    /connect/,
  );
  const f = factory();
  assert.throws(() => registerSandboxProvider("local", f.provider), /不能覆盖/);
  assert.throws(() => registerSandboxProvider("invalid:name", f.provider), /名称必须/);
  assert.equal(resolveSandboxProvider(f.provider), f.provider);
  const encoded = formatSandboxReference(f.provider, "opaque:id");
  const canonicalName = parseSandboxReference(encoded).providerName;
  assert.equal(registerSandboxProvider(canonicalName, f.provider), f.provider);
  assert.throws(() => registerSandboxProvider("duplicate-alias", f.provider), /不能使用其它名称/);
  assert.equal(parseSandboxReference(encoded).sandboxId, "opaque:id");
  assert.deepEqual(parseSandboxReference("legacy-id"), {
    providerName: "local",
    sandboxId: "legacy-id",
  });
  assert.throws(() => formatSandboxReference(f.provider, "x".repeat(160)), /160/);
});

test("concurrent acquisitions share one workspace and switching provider cannot reuse its handle", async () => {
  const a = factory(),
    b = factory(),
    db = database(),
    scope = randomUUID();
  const [first, second] = await Promise.all([
    acquireSandbox(db, scope, async () => {}, a.provider),
    acquireSandbox(db, scope, async () => {}, a.provider),
  ]);
  assert.equal(first, second);
  assert.equal(a.created, 1);
  await assert.rejects(
    () => acquireSandbox(db, scope, async () => {}, b.provider),
    /其它 provider/,
  );
  const before = db.reference;
  await assert.rejects(() => releaseSandbox(db, scope, b.provider), /其它 provider/);
  assert.equal(db.reference, before);
  await releaseSandbox(db, scope);
  assert.equal(a.killed, 1);
  assert.equal(db.reference, null);
});

test("legacy local references are never reinterpreted by a custom provider", async () => {
  const f = factory(),
    db = database("legacy-local-id");
  await assert.rejects(
    () => acquireSandbox(db, randomUUID(), async () => {}, f.provider),
    /属于 provider “local”/,
  );
  assert.equal(f.created, 0);
  assert.equal(db.reference, "legacy-local-id");
});

test("persisted custom references restore and release through their original provider", async () => {
  const f = factory(),
    sandbox = await f.provider.create(),
    db = database(formatSandboxReference(f.provider, sandbox.sandboxId)),
    scope = randomUUID();
  const resumed = await acquireSandbox(db, scope, async () => {}, f.provider);
  assert.equal(resumed, sandbox);
  assert.equal(f.created, 1);
  await releaseSandbox(db, scope);
  assert.equal(f.killed, 1);
  assert.equal(db.reference, null);
  const next = await f.provider.create(),
    another = database(formatSandboxReference(f.provider, next.sandboxId));
  await releaseSandbox(another, randomUUID());
  assert.equal(another.reference, null);
  assert.equal(f.killed, 2);
});

test("unavailable providers and failed termination preserve recoverable references", async () => {
  const db = database("cothread:unavailable-provider:resource");
  await assert.rejects(() => releaseSandbox(db, randomUUID()), /未知的沙箱 provider/);
  assert.equal(db.reference, "cothread:unavailable-provider:resource");
  const f = factory(),
    own = database(),
    scope = randomUUID();
  await acquireSandbox(own, scope, async () => {}, f.provider);
  const before = own.reference;
  f.failKill(true);
  await assert.rejects(() => releaseSandbox(own, scope), /network offline/);
  assert.equal(own.reference, before);
  f.failKill(false);
  await releaseSandbox(own, scope);
  assert.equal(own.reference, null);
});

test("failed persistence cleans up a newly created workspace", async () => {
  const f = factory(),
    db = database();
  db.failWrite(true);
  await assert.rejects(
    () => acquireSandbox(db, randomUUID(), async () => {}, f.provider),
    /database offline/,
  );
  assert.equal(f.created, 1);
  assert.equal(f.killed, 1);
  assert.equal(db.reference, null);
});

test("release never clears a replacement binding and failed database cleanup cannot revive a killed handle", async () => {
  const f = factory(),
    db = database(),
    scope = randomUUID();
  await acquireSandbox(db, scope, async () => {}, f.provider);
  const replacement = "cothread:other-provider:new";
  db.setReference(replacement);
  await releaseSandbox(db, scope);
  assert.equal(db.reference, replacement);
  const other = database(),
    secondScope = randomUUID();
  const first = await acquireSandbox(other, secondScope, async () => {}, f.provider);
  other.failWrite(true);
  await assert.rejects(() => releaseSandbox(other, secondScope), /database offline/);
  other.failWrite(false);
  const second = await acquireSandbox(other, secondScope, async () => {}, f.provider);
  assert.notEqual(first, second);
  await releaseSandbox(other, secondScope);
});
