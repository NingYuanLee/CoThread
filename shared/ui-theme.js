export const DEFAULT_UI_THEME = "forest";

export const UI_THEMES = [
  {
    id: "forest",
    name: "松风",
    hint: "默认青绿",
    preview: ["#f8faf8", "#90a17f", "#3f5945", "#27362f"],
  },
  { id: "tech", name: "靛蓝", hint: "青靛", preview: ["#f7f8fb", "#7686aa", "#384460", "#232a3a"] },
  {
    id: "dusk",
    name: "暮紫",
    hint: "浅紫灰",
    preview: ["#f9f8fa", "#8f80a0", "#4b4058", "#2e2736"],
  },
  { id: "sand", name: "暖沙", hint: "浅茶", preview: ["#faf9f8", "#9e9182", "#574d41", "#352f28"] },
  { id: "ink", name: "墨玉", hint: "深色", preview: ["#1b231c", "#39493b", "#adbbaf", "#d1d9d2"] },
  {
    id: "night",
    name: "暗夜黑",
    hint: "近黑",
    preview: ["#151517", "#2c2c2e", "#cfd3d6", "#e1e5ee"],
  },
];

export function normalizeUiTheme(value) {
  return UI_THEMES.some((theme) => theme.id === value) ? value : DEFAULT_UI_THEME;
}
