import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { startWakeWorker } from "../server/work-events.js";

test("stop is one promise and waits for in-flight work without starting more", async () => {
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  let calls = 0,
    unsubs = 0;
  let wake;
  const stop = startWakeWorker(
    async () => {
      const index = calls++;
      if (index < 2) await gates[index].promise;
      return true;
    },
    {
      concurrency: 2,
      subscribe: (listener) => {
        wake = listener;
        return () => {
          unsubs++;
        };
      },
    },
  );
  await turn();
  assert.equal(calls, 2);
  const first = stop();
  const second = stop();
  assert.equal(first, second);
  assert.equal(unsubs, 1);
  let settled = false;
  first.then(() => {
    settled = true;
  });
  wake();
  await turn();
  assert.equal(settled, false);
  assert.equal(calls, 2);
  gates[0].resolve();
  await turn();
  assert.equal(settled, false);
  assert.equal(calls, 2);
  gates[1].resolve();
  await first;
  await turn();
  wake();
  await turn();
  assert.equal(calls, 2);
  assert.equal(unsubs, 1);
});

test("stop before the queued microtask invokes nothing and unsubscribes once", async () => {
  let calls = 0,
    unsubs = 0;
  let wake;
  const stop = startWakeWorker(
    async () => {
      calls++;
      return true;
    },
    {
      concurrency: 3,
      subscribe: (listener) => {
        wake = listener;
        return () => {
          unsubs++;
        };
      },
    },
  );
  const done = stop();
  assert.equal(stop(), done);
  let settled = false;
  done.then(
    () => {
      settled = true;
    },
    () => {
      settled = "rejected";
    },
  );
  assert.equal(settled, false);
  assert.equal(calls, 0);
  await done;
  await turn();
  wake();
  await turn();
  assert.equal(settled, true);
  assert.equal(calls, 0);
  assert.equal(unsubs, 1);
});

test("a stop queued between admission and invocation skips the work", async () => {
  let stopped = false;
  let startsAfterStop = 0;
  const stop = startWakeWorker(
    () => {
      if (stopped) startsAfterStop++;
      return false;
    },
    {
      subscribe: () => () => {},
    },
  );
  queueMicrotask(() => {
    stopped = true;
    stop();
  });
  await turn();
  await stop();
  assert.equal(startsAfterStop, 0);
});

test("work rejection and a throwing or rejecting onError still drain", async () => {
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  const seen = [];
  let calls = 0;
  try {
    const stop = startWakeWorker(
      async () => {
        const index = calls++;
        if (index === 0) throw new Error("boom");
        if (index === 1) {
          await gates[0].promise;
          throw new Error("later");
        }
        await gates[1].promise;
        return true;
      },
      {
        concurrency: 2,
        subscribe: () => () => {},
        onError(error) {
          seen.push(error.message);
          if (error.message === "boom") throw new Error("onError failed");
          return gates[1].promise.then(() => {
            throw new Error("async onError failed");
          });
        },
      },
    );
    await turn();
    assert.deepEqual(seen, ["boom"]);
    assert.equal(calls, 2);
    const done = stop();
    let settled = false;
    done.then(
      () => {
        settled = true;
      },
      () => {
        settled = "rejected";
      },
    );
    await turn();
    assert.equal(settled, false);
    assert.equal(calls, 2);
    gates[0].resolve();
    await turn();
    assert.equal(seen.includes("later"), true);
    assert.equal(settled, false, "stop waits until rejecting onError settles");
    gates[1].resolve();
    await done;
    await turn();
    assert.equal(settled, true);
    assert.equal(calls, 2);
    assert.deepEqual(unhandled, []);
  } finally {
    gates.forEach((gate) => gate.resolve());
    process.off("unhandledRejection", onUnhandled);
  }
});
