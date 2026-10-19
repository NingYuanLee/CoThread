import test from "node:test";
import assert from "node:assert/strict";
import { mergeThread } from "../shared/thread-window.js";
import { readThreadPages } from "../shared/thread-reader.js";
import { threadSideStateToken, THREAD_SIDE_COLLECTIONS } from "../shared/thread-side-state.js";
import { threadPollKey } from "../shared/poll-signature.js";

const token = (letter) => `s1:${letter.repeat(43)}`;
const message = (sequence) => ({
  id: `m${sequence}`,
  sequence: String(sequence),
  body: `body ${sequence}`,
});
function snapshot(letter = "a") {
  return {
    id: "thread",
    messages: [message(1)],
    events: [],
    page: { before: "1", after: "1", hasMore: false },
    ...Object.fromEntries(
      THREAD_SIDE_COLLECTIONS.map((key) => [key, [{ id: key, status: "running" }]]),
    ),
    sideState: { mode: "snapshot", token: token(letter) },
  };
}
function unchanged(letter = "a", messages = []) {
  return {
    ...snapshot(letter),
    messages,
    ...Object.fromEntries(THREAD_SIDE_COLLECTIONS.map((key) => [key, []])),
    sideState: { mode: "unchanged", token: token(letter) },
  };
}

test("unchanged side state retains every collection while messages and metadata advance", () => {
  const previous = mergeThread(undefined, snapshot());
  const incoming = {
    ...unchanged("a", [message(2)]),
    contextUsage: { used: 17 },
    page: { after: "2", hasMore: false },
  };
  const merged = mergeThread(previous, incoming);
  for (const key of THREAD_SIDE_COLLECTIONS) assert.equal(merged[key], previous[key]);
  assert.deepEqual(
    merged.messages.map((m) => m.id),
    ["m1", "m2"],
  );
  assert.equal(merged.contextUsage.used, 17);
  assert.equal(merged.sideState.mode, "snapshot");
  assert.equal(threadSideStateToken(merged), token("a"));
});

test("new snapshots replace deleted rows and usage-only changes alter the poll key", () => {
  const previous = mergeThread(undefined, snapshot());
  const fresh = { ...snapshot("b"), replies: [], requests: [{ usage_stats: { totalTokens: 99 } }] };
  const merged = mergeThread(previous, fresh);
  assert.deepEqual(merged.replies, []);
  assert.equal(merged.requests[0].usage_stats.totalTokens, 99);
  assert.notEqual(threadPollKey(previous), threadPollKey(merged));
});

test("an unchanged response needs a matching in-memory snapshot from the same thread", () => {
  const previous = mergeThread(undefined, snapshot());
  for (const base of [
    undefined,
    JSON.parse(JSON.stringify(previous)),
    { ...previous, id: "other" },
  ])
    assert.throws(() => mergeThread(base, unchanged()), { code: "THREAD_SIDE_STATE_MISMATCH" });
  assert.throws(() => mergeThread(previous, unchanged("b")), {
    code: "THREAD_SIDE_STATE_MISMATCH",
  });
});

test("optimistic side collection replacement invalidates its token, including an older-page merge", () => {
  const previous = mergeThread(undefined, snapshot());
  const optimistic = {
    ...previous,
    replies: [...previous.replies, { id: "local", status: "queued" }],
  };
  assert.equal(threadSideStateToken(optimistic), undefined);
  const older = {
    ...snapshot(),
    sideState: undefined,
    messages: [],
    page: { after: "1", before: null, hasMore: false },
  };
  assert.equal(threadSideStateToken(mergeThread(optimistic, older, true)), undefined);
  assert.throws(() => mergeThread(optimistic, unchanged()), { code: "THREAD_SIDE_STATE_MISMATCH" });
});

test("page reader hydrates each catch-up page and retains concurrent local messages", async () => {
  let current = mergeThread(undefined, snapshot());
  const calls = [];
  const merged = await readThreadPages(
    () => current,
    async (after, state) => {
      calls.push([after, state]);
      if (calls.length === 1) {
        current = {
          ...current,
          messages: [
            ...current.messages,
            { ...message(4), id: "optimistic:m4", render_key: "optimistic:m4" },
          ],
        };
        return { ...unchanged("a", [message(2)]), page: { after: "2", hasMore: true } };
      }
      return { ...unchanged("a", [message(3)]), page: { after: "3", hasMore: false } };
    },
  );
  assert.deepEqual(calls, [
    ["1", token("a")],
    ["2", token("a")],
  ]);
  assert.deepEqual(
    merged.messages.map((m) => m.id),
    ["m1", "m2", "m3", "optimistic:m4"],
  );
  assert.equal(merged.page.after, "3");
  assert.equal(merged.replies.length, 1);
});

test("mismatched transport state retries one full snapshot rather than accepting empty arrays", async () => {
  const previous = mergeThread(undefined, snapshot());
  const calls = [];
  const merged = await readThreadPages(
    () => previous,
    async (after, state) => {
      calls.push(state);
      return state === "initial" ? snapshot("b") : unchanged("b");
    },
  );
  assert.deepEqual(calls, [token("a"), "initial"]);
  assert.equal(merged.replies.length, 1);
  assert.equal(threadSideStateToken(merged), token("b"));
});

test("legacy servers keep full snapshots and aborts never trigger a resync retry", async () => {
  const legacy = { ...snapshot(), sideState: undefined };
  const merged = await readThreadPages(
    () => undefined,
    async () => legacy,
  );
  assert.equal(merged.replies.length, 1);
  assert.equal(threadSideStateToken(merged), undefined);
  let calls = 0;
  await assert.rejects(
    readThreadPages(
      () => merged,
      async () => {
        calls++;
        throw new DOMException("cancelled", "AbortError");
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
