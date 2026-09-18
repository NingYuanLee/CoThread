export const DEFAULT_UI_THEME = "forest";

export const UI_THEMES = [
  { id: "forest", name: "松风", hint: "默认青绿", preview: ["#f8faf8", "#90a17f", "#3f5945", "#27362f"] },
  { id: "ocean", name: "海雾", hint: "雾蓝", preview: ["#f8f9fa", "#7e90a2", "#3e4c5a", "#262f37"] },
  { id: "tech", name: "靛蓝", hint: "青靛", preview: ["#f7f8fb", "#7686aa", "#384460", "#232a3a"] },
  { id: "mist", name: "青石", hint: "青灰", preview: ["#f8fafa", "#80a099", "#405853", "#283533"] },
  { id: "dusk", name: "暮紫", hint: "浅紫灰", preview: ["#f9f8fa", "#8f80a0", "#4b4058", "#2e2736"] },
  { id: "sand", name: "暖沙", hint: "浅茶", preview: ["#faf9f8", "#9e9182", "#574d41", "#352f28"] },
  { id: "ink", name: "墨玉", hint: "深色", preview: ["#1b231c", "#39493b", "#adbbaf", "#d1d9d2"] },
  { id: "night", name: "暗夜黑", hint: "近黑", preview: ["#0e0f10", "#242629", "#c8c8c9", "#e6e6e7"] },
];

export function normalizeUiTheme(value) {
  return UI_THEMES.some((theme) => theme.id === value) ? value : DEFAULT_UI_THEME;
}
