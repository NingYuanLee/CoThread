import assert from "node:assert/strict";
import test from "node:test";
import { createResourceCache } from "../shared/resource-cache.js";

const permissionError = (status) => Object.assign(new Error("revoked"), { status });

function deferred() {
  let resolve, reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("update invalidates an older read so a stale completion cannot overwrite the local mutation", async () => {
  const cache = createResourceCache(2);
  cache.update("a", () => "original");
  const stale = deferred();
  let signal;
  const pendingRead = cache.read("a", (next) => {
    signal = next;
    return stale.promise;
  });
  await Promise.resolve();
  assert.equal(
    cache.update("a", (previous) => {
      assert.equal(previous, "original");
      return "local";
    }),
    "local",
  );
  assert.equal(signal.aborted, true);

  let visible = "local";
  stale.resolve("stale");
  try {
    visible = await pendingRead;
  } catch (error) {
    assert.equal(error.name, "AbortError");
    assert.equal(error.message, "Request superseded");
    assert.equal(error.status, undefined);
  }
  assert.equal(visible, "local");
  assert.equal(cache.get("a"), "local");

  let earlyCalls = 0;
  const early = cache.read("early", () => {
    earlyCalls += 1;
    return "network";
  });
  assert.equal(
    cache.update("early", () => "local"),
    "local",
  );
  await assert.rejects(early, { name: "AbortError", message: "Request superseded" });
  assert.equal(earlyCalls, 0);
  assert.equal(cache.get("early"), "local");
  assert.equal(await cache.read("early", async () => "later"), "later");
});

test("a stale 403 becomes AbortError and does not clear the updated entry", async () => {
  const cache = createResourceCache(2);
  cache.update("other", () => "kept");
  cache.update("thread", () => ({ title: "fresh" }));
  const stale = deferred();
  const pendingRead = cache.read("thread", () => stale.promise);
  await Promise.resolve();
  const edited = cache.update("thread", (previous) => ({ ...previous, title: "edited" }));
  assert.deepEqual(edited, { title: "edited" });

  let visible = edited;
  stale.reject(permissionError(403));
  try {
    visible = await pendingRead;
  } catch (error) {
    if (error.name !== "AbortError" && [401, 403, 404].includes(error.status)) visible = null;
    assert.equal(error.name, "AbortError");
    assert.equal(error.status, undefined);
    assert.notEqual(error.message, "revoked");
  }
  assert.deepEqual(visible, { title: "edited" });
  assert.deepEqual(cache.get("thread"), { title: "edited" });
  assert.equal(cache.get("other"), "kept");

  cache.update("live", () => "visible");
  await assert.rejects(
    cache.read("live", async () => {
      throw permissionError(403);
    }),
    { message: "revoked", status: 403 },
  );
  assert.equal(cache.get("live"), undefined);
  assert.deepEqual(cache.get("thread"), { title: "edited" });
});

test("a throwing transform keeps the previous cache entry and pending request", async () => {
  const cache = createResourceCache(2);
  cache.update("a", () => "a");
  cache.update("b", () => "b");
  const pending = deferred();
  let signal;
  const pendingRead = cache.read("a", (next) => {
    signal = next;
    return pending.promise;
  });
  await Promise.resolve();
  assert.throws(
    () =>
      cache.update("a", () => {
        throw new Error("bad transform");
      }),
    { message: "bad transform" },
  );
  assert.equal(cache.get("a"), "a");
  assert.equal(signal.aborted, false);
  pending.resolve("fresh");
  assert.equal(await pendingRead, "fresh");
  assert.equal(cache.get("a"), "fresh");

  const ordered = createResourceCache(2);
  ordered.update("a", () => "a");
  ordered.update("b", () => "b");
  assert.throws(
    () =>
      ordered.update("a", () => {
        throw new Error("bad transform");
      }),
    /bad transform/,
  );
  ordered.update("c", () => "c");
  assert.equal(ordered.get("a"), undefined);
  assert.equal(ordered.get("b"), "b");
  assert.equal(ordered.get("c"), "c");
  assert.throws(
    () =>
      ordered.update("missing", () => {
        throw new Error("nope");
      }),
    /nope/,
  );
  assert.equal(ordered.get("missing"), undefined);
});

test("update uses the same capacity and insertion recency rules as read", async () => {
  const cache = createResourceCache(2);
  cache.update("a", () => "a");
  cache.update("b", () => "b");
  assert.equal(
    cache.update("a", (previous) => `${previous}2`),
    "a2",
  );
  cache.update("c", () => "c");
  assert.equal(cache.get("a"), "a2");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "c");

  const mixed = createResourceCache(2);
  await mixed.read("a", async () => "a");
  await mixed.read("b", async () => "b");
  mixed.update("a", () => "a2");
  await mixed.read("c", async () => "c");
  assert.equal(mixed.get("a"), "a2");
  assert.equal(mixed.get("b"), undefined);
  assert.equal(mixed.get("c"), "c");

  const filledByRead = createResourceCache(2);
  filledByRead.update("a", () => "a");
  filledByRead.update("b", () => "b");
  await filledByRead.read("c", async () => "c");
  assert.equal(filledByRead.get("a"), undefined);
  assert.equal(filledByRead.get("b"), "b");
  assert.equal(filledByRead.get("c"), "c");

  const refreshed = createResourceCache(2);
  refreshed.update("a", () => "a");
  refreshed.update("b", () => "b");
  refreshed.update("b", () => "b2");
  refreshed.update("c", () => "c");
  assert.equal(refreshed.get("a"), undefined);
  assert.equal(refreshed.get("b"), "b2");
  assert.equal(refreshed.get("c"), "c");
});

test("limit must be a positive integer", { timeout: 1000 }, () => {
  const invalid = [-1, -12, NaN, 0, -0, 1.5, 2.2, Infinity, -Infinity, "2", null, false];
  for (const limit of invalid) {
    assert.throws(() => createResourceCache(limit), {
      name: "RangeError",
      message: "Resource cache limit must be a positive integer",
    });
  }
  assert.equal(
    createResourceCache().update("ok", () => "ok"),
    "ok",
  );
  assert.equal(createResourceCache(undefined).get("missing"), undefined);
  const one = createResourceCache(1);
  one.update("first", () => "first");
  one.update("second", () => "second");
  assert.equal(one.get("first"), undefined);
  assert.equal(one.get("second"), "second");
});

test("read deduplicates callers and skips a loader cancelled before it starts", async () => {
  const cache = createResourceCache(2);
  let calls = 0;
  let signal;
  const first = cache.read("a", (next) => {
    calls += 1;
    signal = next;
    return Promise.resolve("one");
  });
  const second = cache.read("a", () => {
    calls += 1;
    return Promise.resolve("two");
  });
  assert.equal(first, second);
  assert.equal(await first, "one");
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  assert.equal(cache.get("a"), "one");

  let cancelledCalls = 0;
  const cancelled = cache.read("b", () => {
    cancelledCalls += 1;
    return "hidden";
  });
  cache.cancel("b");
  const replacement = cache.read("b", async () => "visible");
  await assert.rejects(cancelled, { name: "AbortError", message: "Request superseded" });
  assert.equal(cancelledCalls, 0);
  assert.equal(await replacement, "visible");
  assert.equal(cache.get("b"), "visible");

  let forcedCalls = 0;
  const superseded = cache.read("d", () => {
    forcedCalls += 1;
    return "old";
  });
  const forced = cache.read("d", async () => "new", true);
  assert.notEqual(forced, superseded);
  await assert.rejects(superseded, { name: "AbortError" });
  assert.equal(forcedCalls, 0);
  assert.equal(await forced, "new");
  assert.equal(cache.get("d"), "new");

  const late = deferred();
  let startedSignal;
  const started = cache.read("c", (next) => {
    startedSignal = next;
    return late.promise;
  });
  await Promise.resolve();
  cache.cancel("c");
  assert.equal(startedSignal.aborted, true);
  late.resolve("late");
  await assert.rejects(started, { name: "AbortError" });
  assert.equal(cache.get("b"), "visible");
  assert.equal(cache.get("d"), "new");
  assert.equal(cache.get("c"), undefined);
});
