import test from "node:test";
import assert from "node:assert/strict";
import { projectThreadSideState } from "../server/thread-side-state.js";
import { THREAD_SIDE_COLLECTIONS } from "../shared/thread-side-state.js";

const user = { id: "member", kind: "session" };
const make = () => ({
  id: "thread",
  messages: [],
  contextUsage: { used: 0 },
  ...Object.fromEntries(THREAD_SIDE_COLLECTIONS.map((key) => [key, [{ id: key, value: 1 }]])),
});
const project = (context, requested, actor = user, projection = [false, false]) =>
  projectThreadSideState(context, actor, requested, projection);

test("side-state projection is opt-in and does not mutate its source snapshot", () => {
  const context = make();
  assert.equal(project(context, undefined), context);
  const initial = project(context, "initial");
  const unchanged = project(context, initial.sideState.token);
  assert.equal(unchanged.sideState.mode, "unchanged");
  for (const key of THREAD_SIDE_COLLECTIONS) {
    assert.equal(context[key].length, 1);
    assert.equal(unchanged[key].length, 0);
  }
  assert.equal(context.sideState, undefined);
});

test("updates and removals in every side collection invalidate the token", () => {
  const original = make();
  const token = project(original, "initial").sideState.token;
  for (const key of THREAD_SIDE_COLLECTIONS) {
    for (const value of [[], [{ id: key, value: 2 }]]) {
      const changed = project({ ...original, [key]: value }, token);
      assert.equal(changed.sideState.mode, "snapshot", key);
      assert.notEqual(changed.sideState.token, token, key);
      assert.deepEqual(changed[key], value);
    }
  }
  const outside = project(
    { ...original, contextUsage: { used: 99 }, messages: [{ id: "new" }] },
    token,
  );
  assert.equal(outside.sideState.mode, "unchanged");
  assert.equal(outside.contextUsage.used, 99);
  assert.equal(outside.messages.length, 1);
});

test("tokens are bound to user identity, credential scope, thread and projection", () => {
  const context = make();
  const token = project(context, "initial").sideState.token;
  for (const [actor, value, projection] of [
    [{ ...user, id: "another" }, context, [false, false]],
    [{ ...user, kind: "api" }, context, [false, false]],
    [{ ...user, scope: "project" }, context, [false, false]],
    [user, { ...context, id: "other" }, [false, false]],
    [user, context, [true, false]],
  ])
    assert.equal(project(value, token, actor, projection).sideState.mode, "snapshot");
});
