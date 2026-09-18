export const DEFAULT_UI_THEME: "forest";
export const UI_THEMES: readonly {
  id: string;
  name: string;
  hint: string;
  preview: readonly string[];
}[];
export function normalizeUiTheme(value: unknown): string;
