import test from "node:test";
import assert from "node:assert/strict";
import { mergeThread, threadPollCursor } from "../shared/thread-window.js";

const message = (id, sequence) => ({ id, sequence: String(sequence) });
const snapshot = (messages, after, before = "1", hasMore = false) => ({
  id: "thread",
  messages,
  events: [],
  page: { before, after, hasMore },
});

test("optimistic and locally committed messages cannot move the server poll cursor", () => {
  for (const local of [message("optimistic:mine", 11), message("mine", 12)]) {
    const cached = snapshot([message("known", 10), local], "10");
    assert.equal(threadPollCursor(cached), "10");
    const serverRows = [message("remote", 11), message("mine", 12)];
    const fetched = serverRows.filter(
      (row) => BigInt(row.sequence) > BigInt(threadPollCursor(cached)),
    );
    const merged = mergeThread(cached, snapshot(fetched, "12"));
    assert.deepEqual(
      merged.messages.map((row) => row.id),
      ["known", "remote", "mine"],
    );
    assert.equal(threadPollCursor(merged), "12");
  }
});

test("a timed-out send is reconciled with its committed server row and keeps its render key", () => {
  const pending = { ...message("optimistic:mine", 11), delivery_status: "failed" };
  const cached = snapshot([message("known", 10), pending], "10");
  const merged = mergeThread(cached, snapshot([message("mine", 11), message("reply", 12)], "12"));
  assert.deepEqual(
    merged.messages.map((row) => row.id),
    ["known", "mine", "reply"],
  );
  assert.equal(merged.messages[1].render_key, pending.id);
  assert.equal(merged.messages[1].delivery_status, undefined);
  const repeated = mergeThread(merged, snapshot([message("mine", 11)], "12"));
  assert.equal(repeated.messages[1].render_key, pending.id);
  assert.equal(repeated.messages.length, 3);
});

test("delta pages advance the cursor without losing older-history pagination", () => {
  const cached = snapshot([message("m10", 10)], "10", "10", true);
  const first = mergeThread(cached, snapshot([message("m11", 11)], "11", "11", false));
  const next = mergeThread(first, snapshot([message("m12", 12)], "12", "12", false));
  assert.deepEqual(next.page, { before: "10", after: "12", hasMore: true });
  const empty = mergeThread(next, snapshot([], "12", null));
  assert.equal(threadPollCursor(empty), "12");
  assert.equal(empty.messages.length, 3);
});

test("older history never regresses the forward cursor and events stay deduplicated", () => {
  const current = {
    ...snapshot([message("m10", 10), message("m12", 12)], "12", "10", true),
    events: [{ id: 1, status: "running" }],
  };
  const history = {
    ...snapshot([message("m1", 1), message("m10", 10)], "10", "1", false),
    events: [{ id: 1, status: "completed" }, { id: 2 }],
  };
  const merged = mergeThread(current, history, true);
  assert.deepEqual(merged.page, { before: "1", after: "12", hasMore: false });
  assert.deepEqual(
    merged.messages.map((row) => row.sequence),
    ["1", "10", "12"],
  );
  assert.deepEqual(merged.events, [{ id: 1, status: "completed" }, { id: 2 }]);
});

test("a cache without an authoritative server page requests a recent snapshot", () => {
  assert.equal(threadPollCursor(undefined), undefined);
  const unpaged = { messages: [message("mine", 999)], events: [] };
  assert.equal(threadPollCursor(unpaged), undefined);
  const merged = mergeThread(unpaged, snapshot([message("remote", 1)], "1"));
  assert.equal(threadPollCursor(merged), "1");
});
