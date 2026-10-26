import { test } from "node:test";
import assert from "node:assert/strict";
import { beijingClockText, beijingNow } from "../shared/beijing-time.js";

test("clock text uses Beijing time even when the instant is UTC", () => {
  const afternoon = new Date("2026-10-26T07:45:57.000Z");
  assert.equal(beijingNow(afternoon), "2026-10-26 15:45:57 星期一");
  assert.match(beijingClockText(afternoon), /当前时刻：2026-10-26 15:45:57 星期一（北京时间）/);
  const midnight = new Date("2026-10-26T16:00:00.000Z");
  assert.equal(beijingNow(midnight), "2026-10-27 00:00:00 星期二");
});
