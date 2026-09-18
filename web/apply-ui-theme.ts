import { DEFAULT_UI_THEME, normalizeUiTheme } from "../shared/ui-theme.js";

const STORAGE_KEY = "cothread-ui-theme";

export function applyUiTheme(value?: string | null) {
  const theme = normalizeUiTheme(value || DEFAULT_UI_THEME);
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}
