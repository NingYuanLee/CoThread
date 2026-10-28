/**
 * 对话区贴底跟随的纯判定：从 use-stick-to-bottom 里抽出来，便于在无浏览器环境回归测试。
 * 判定错了会直接表现为「点左侧缩略条跳不动、滚动条像被拉住」：平滑滚动从底部起步时
 * gap 还小于阈值，若把这一帧当成「人回到底部」重新开启跟随，下一次 scroll 就会被拽回底部。
 * 键盘向上同理：方向键一次只滚几十像素，若阈值内重新 follow，贴底会把这一下拉回最底。
 */
/** 距底部不足这么多像素就算「贴着底部」。 */
export const NEAR_BOTTOM = 100;
/** 程序化跳转的保护窗口，要盖住一次平滑滚动的全程（含长距离）。 */
export const PROGRAMMATIC_MS = 1500;

export type FollowDecision =
  /** 打开跟随（贴近底部）。 */
  | "follow"
  /** 关闭跟随（人主动离开，或正在程序化跳转）。 */
  | "leave"
  /** 保持跟随并贴一次底（内容长高、人没动）。 */
  | "pin"
  /** 什么都不做。 */
  | "keep";

export function decideFollow(input: {
  /** 距底部像素。 */
  gap: number;
  /** 是否处于程序化跳转窗口（如点左侧缩略条）。 */
  jumping: boolean;
  /** 人是否正在滚轮/触摸/按键/拖滚动条。 */
  userIntent: boolean;
  /** 当前是否跟随。 */
  following: boolean;
  /** 这次滚动在远离底部（scrollTop 变小）。向上翻时即使还在阈值内也要松开。 */
  departing?: boolean;
}): FollowDecision {
  // 跳转是用户主动去定位消息，窗口内一律不跟随；否则平滑滚动起步帧会被误判成回到底部。
  if (input.jumping && !input.userIntent) return "leave";
  // 人正在往上翻：方向键、滚轮、拖滚动条离开底部。阈值内也松开，避免紧接着的贴底拽回去。
  if (input.userIntent && input.departing) return "leave";
  if (input.gap < NEAR_BOTTOM) return "follow";
  if (input.userIntent) return "leave";
  return input.following ? "pin" : "keep";
}
