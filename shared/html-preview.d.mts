export const PREVIEW_CONSOLE_MESSAGE: "cothread-preview-console";
export const PREVIEW_NAVIGATION_MESSAGE: "cothread-preview-navigation";
export const PREVIEW_NEW_WINDOW_MESSAGE: "cothread-preview-new-window";
export function previewConsoleProbeHtml(): string;
export function resolvePreviewAssetPath(ref: string): string | null;
export function inlineHtmlPreviewAssets(
  html: string,
  loadAsset: (path: string) => Promise<string>,
): Promise<string>;
