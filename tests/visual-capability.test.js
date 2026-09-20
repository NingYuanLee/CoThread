import test from "node:test";
import assert from "node:assert/strict";
import { visualVerificationEnabled, visualVerificationSkip } from "../server/visual-capability.js";

test("visual verification can be skipped for text-only model declarations", () => {
  assert.equal(visualVerificationEnabled("executor", { EXECUTOR_MODEL_VISION: "false" }), false);
  assert.equal(visualVerificationEnabled("executor", { EXECUTOR_MODEL_VISION: "true" }), true);
  assert.equal(visualVerificationSkip("l3").reason, "model_no_image_input");
});
