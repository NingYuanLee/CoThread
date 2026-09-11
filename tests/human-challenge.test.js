import { test } from "node:test";
import assert from "node:assert/strict";
import { createHumanChallenge } from "../server/human-challenge.js";

test("human challenge is self-contained and avoids ambiguous characters", () => {
  const challenge = createHumanChallenge();
  assert.match(challenge.text, /^[A-HJ-NP-Za-hj-np-z2-9]{5}$/);
  assert.match(challenge.data, /^<svg[^>]*>/);
  assert.match(challenge.data, /<text /);
  assert.match(challenge.data, /<path /);
  assert.doesNotMatch(challenge.data, /(?:href|url\(|\.ttf|\.woff)/i);
  for (const character of challenge.text)
    assert.match(challenge.data, new RegExp(`>${character}</text>`));
});
