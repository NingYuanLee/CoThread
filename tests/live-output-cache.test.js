import test from "node:test";
import assert from "node:assert/strict";
import { liveOutputSnapshot } from "../server/agent-live-output.js";

const rows = [
  {
    message_id: "message",
    run_id: "new-run",
    step: 1,
    reasoning: "",
    content: "new output",
    revision: 2,
    status: "running",
  },
];

for (const completed of [true, false]) {
  test(`an older snapshot failure preserves the newer ${completed ? "completed" : "pending"} read`, async (t) => {
    let now = 1000;
    t.mock.method(Date, "now", () => now);
    const older = Promise.withResolvers(),
      newer = Promise.withResolvers();
    let calls = 0;
    const db = {
      execute() {
        calls++;
        if (calls === 1) return older.promise;
        if (calls === 2) return newer.promise;
        return Promise.resolve([[]]);
      },
    };
    const error = new Error("older query failed late");
    const first = liveOutputSnapshot(db, "thread");
    const firstRejected = assert.rejects(first, (actual) => actual === error);
    try {
      now += 501;
      const second = liveOutputSnapshot(db, "thread");
      if (completed) {
        newer.resolve([rows]);
        await second;
      }
      older.reject(error);
      await firstRejected;
      const third = liveOutputSnapshot(db, "thread");
      assert.equal(calls, 2, "late failure must not force a third SQL query");
      newer.resolve([rows]);
      assert.deepEqual(await second, rows);
      assert.deepEqual(await third, rows);
    } finally {
      older.reject(error);
      newer.resolve([rows]);
      await firstRejected;
    }
  });
}

test("a current failed snapshot is evicted so the next read can recover", async () => {
  let calls = 0;
  const error = new Error("current snapshot failed");
  const db = {
    async execute() {
      if (++calls === 1) throw error;
      return [rows];
    },
  };
  await assert.rejects(liveOutputSnapshot(db, "thread"), (actual) => actual === error);
  assert.deepEqual(await liveOutputSnapshot(db, "thread"), rows);
  assert.equal(calls, 2);
});

test("fresh snapshot reads deduplicate per thread and stay isolated per pool", async () => {
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  let firstCalls = 0,
    otherCalls = 0;
  const db = {
    execute() {
      firstCalls++;
      return gates[0].promise;
    },
  };
  const other = {
    execute() {
      otherCalls++;
      return gates[1].promise;
    },
  };
  const a = liveOutputSnapshot(db, "thread"),
    b = liveOutputSnapshot(db, "thread");
  const c = liveOutputSnapshot(other, "thread");
  gates.forEach((gate) => gate.resolve([rows]));
  assert.deepEqual(await Promise.all([a, b, c]), [rows, rows, rows]);
  assert.equal(firstCalls, 1);
  assert.equal(otherCalls, 1);
});
