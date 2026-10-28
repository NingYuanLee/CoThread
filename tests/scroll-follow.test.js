import { test } from "node:test";
import assert from "node:assert/strict";
import { NEAR_BOTTOM, PROGRAMMATIC_MS, decideFollow } from "../web/scroll-follow.ts";

// 回归：群聊/单聊贴底时点左侧缩略条跳消息，平滑滚动从底部起步的几帧 gap 仍小于阈值，
// 早期版本在这一帧把 follow 重新置 true，随后 pin() 把位置拽回最底部，表现为点了没反应。
test("贴底跳转窗口内不得重新开启跟随", () => {
  const windows = [0, 12, NEAR_BOTTOM - 1, NEAR_BOTTOM, 480];
  for (const gap of windows) {
    assert.equal(
      decideFollow({ gap, jumping: true, userIntent: false, following: false }),
      "leave",
      `gap=${gap} 时跳转中必须 leave`,
    );
    assert.equal(
      decideFollow({ gap, jumping: true, userIntent: false, following: true }),
      "leave",
      `gap=${gap} 时跳转中即使 follow 为 true 也必须解除`,
    );
  }
  // 窗口设计上要盖住一次平滑滚动。
  assert.ok(PROGRAMMATIC_MS >= 1000);
});

test("跳转结束后按落点决定是否继续跟随", () => {
  // 落到接近底部（如点了最后一条）→ 恢复跟随
  assert.equal(
    decideFollow({ gap: 20, jumping: false, userIntent: false, following: false }),
    "follow",
  );
  // 落到历史中间 → 保持不跟随
  assert.equal(
    decideFollow({ gap: 800, jumping: false, userIntent: false, following: false }),
    "keep",
  );
});

test("人主动滚轮/触摸/按键的原有语义不变", () => {
  // 往上翻过阈值 → 解除跟随
  assert.equal(
    decideFollow({ gap: 400, jumping: false, userIntent: true, following: true }),
    "leave",
  );
  // 滚回底部 → 重新跟随
  assert.equal(
    decideFollow({ gap: 50, jumping: false, userIntent: true, following: false }),
    "follow",
  );
  // 人接管后，跳转窗口不再挡着
  assert.equal(
    decideFollow({ gap: 400, jumping: true, userIntent: true, following: true }),
    "leave",
  );
});

test("向上键还在阈值内也必须松开跟随", () => {
  // 回归：贴底时按向上键，一次只滚几十像素，gap 仍小于阈值。
  // 若这一帧重新 follow，随后 pin() 会把位置拽回最底部。
  for (const gap of [0, 12, 40, NEAR_BOTTOM - 1]) {
    assert.equal(
      decideFollow({ gap, jumping: false, userIntent: true, following: true, departing: true }),
      "leave",
      `gap=${gap} 时向上翻必须 leave`,
    );
  }
  // 没有在远离底部（例如按向下键滚回来）时，阈值内仍恢复跟随。
  assert.equal(
    decideFollow({ gap: 40, jumping: false, userIntent: true, following: false, departing: false }),
    "follow",
  );
});

test("跟随中内容长高清过阈值且人没动：继续贴底", () => {
  assert.equal(
    decideFollow({ gap: 300, jumping: false, userIntent: false, following: true }),
    "pin",
  );
  assert.equal(
    decideFollow({ gap: 60, jumping: false, userIntent: false, following: true }),
    "follow",
  );
  assert.equal(
    decideFollow({ gap: 300, jumping: false, userIntent: false, following: false }),
    "keep",
  );
});
