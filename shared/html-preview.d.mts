export const PREVIEW_CONSOLE_MESSAGE: "cothread-preview-console";
export function previewConsoleProbeHtml(): string;
export function resolvePreviewAssetPath(ref: string): string | null;
export function inlineHtmlPreviewAssets(
  html: string,
  loadAsset: (path: string) => Promise<string>,
): Promise<string>;
