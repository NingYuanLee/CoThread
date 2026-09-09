import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn, setTimeout as delay } from "node:timers/promises";
import { publishWork, subscribeWork, startWakeWorker } from "../server/work-events.js";
import { createWakeGate } from "../shared/wake-gate.js";
import { drainReplies } from "../server/reply-dispatch.js";

test("idle workers stop querying, wake on commits and retain notifications received during a query", async () => {
  const db = {}, gate = Promise.withResolvers();
  let calls = 0, work = 0;
  const stop = startWakeWorker(async () => {
    calls++;
    if (calls === 1) { await gate.promise; return false; }
    return work-- > 0;
  }, { subscribe: (wake) => subscribeWork(db, wake) });
  try {
    await turn();
    work = 1;
    publishWork(db, "discussion");
    gate.resolve();
    for (let i = 0; i < 5; i++) await turn();
    assert.equal(calls, 3);
    await turn();
    assert.equal(calls, 3, "idle loop must not keep querying");
    publishWork({}, "other-database");
    await turn();
    assert.equal(calls, 3);
    work = 1;
    publishWork(db, "discussion");
    for (let i = 0; i < 5; i++) await turn();
    assert.equal(calls, 5);
  } finally { gate.resolve(); stop(); }
  publishWork(db);
  await turn();
  assert.equal(calls, 5);
});

test("wake pool bounds simultaneous work and drains newly available jobs after a sibling sees idle", async () => {
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  let calls = 0, active = 0, peak = 0;
  const stop = startWakeWorker(async () => {
    const index = calls++;
    active++; peak = Math.max(peak, active);
    try { if (index < 2) await gates[index].promise; return index === 0 || index === 2; }
    finally { active--; }
  }, { concurrency: 2, subscribe: () => () => {} });
  try {
    await turn();
    gates[1].resolve(); await turn();
    gates[0].resolve();
    for (let i = 0; i < 5; i++) await turn();
    assert.ok(calls >= 4);
    assert.equal(peak, 2);
    const idleCalls = calls; await turn(); assert.equal(calls, idleCalls);
  } finally { gates.forEach((gate) => gate.resolve()); stop(); }
});

test("browser wakeups deduplicate, back off failures and allow new work after successful dispatch", async () => {
  let clock = 0, calls = 0, fail = true;
  const gate = createWakeGate(async () => { calls++; if (fail) throw new Error("offline"); }, () => clock);
  const first = gate("one");
  assert.equal(gate("one"), undefined);
  await first;
  assert.equal(gate("one", undefined, true), undefined, "new messages must not flood a failed gateway");
  clock = 30000; await gate("one");
  assert.equal(calls, 2);
  clock = 60000; assert.equal(gate("one"), undefined);
  clock = 90000; fail = false; await gate("one");
  assert.equal(gate("one"), undefined);
  await gate("one", undefined, true);
  assert.equal(calls, 4);
});

test("a long hosted child does not cause rapid empty coordinator and maintenance queries", async () => {
  const child = Promise.withResolvers();
  let claims = 0, routes = 0, checks = 0;
  const running = drainReplies(async () => { if (++claims === 1) { await child.promise; return true; } return false; },
    "thread", Date.now() + 4000, async () => { routes++; return false; }, async () => { checks++; return false; });
  try {
    await delay(450);
    assert.ok(routes <= 2, `routing scanned ${routes} times`);
    assert.ok(checks <= 2, `maintenance scanned ${checks} times`);
  } finally { child.resolve(); await running; }
});
