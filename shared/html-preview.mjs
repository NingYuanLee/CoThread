export function resolvePreviewAssetPath(ref) {
  const trimmed = String(ref || "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  let path = trimmed.replace(/^\.\//, "");
  const marker = "/preview/";
  const previewAt = path.indexOf(marker);
  if (path.startsWith("/api/versions/") && previewAt >= 0) {
    path = path.slice(previewAt + marker.length);
  } else {
    path = path.replace(/^\/+/, "");
  }
  if (!path || path.includes("..")) return null;
  return path;
}

async function replaceAllAsync(html, regexp, replacer) {
  const matches = [...html.matchAll(regexp)];
  let out = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const replacement = await replacer(match);
    out =
      out.slice(0, match.index) +
      replacement +
      out.slice(match.index + match[0].length);
  }
  return out;
}

function escapeEmbedded(text, tag) {
  return String(text).replace(
    new RegExp(`</${tag}`, "gi"),
    `<\\/${tag}`,
  );
}

export async function inlineHtmlPreviewAssets(html, loadAsset) {
  let out = String(html || "").replace(/<base\s[^>]*>/gi, "");
  out = await replaceAllAsync(
    out,
    /<link\b([^>]*?)href\s*=\s*(["'])([^"']+)\2([^>]*)\/?>/gi,
    async (match) => {
      if (!/stylesheet/i.test(match[0])) return match[0];
      const path = resolvePreviewAssetPath(match[3]);
      if (!path) return match[0];
      const css = await loadAsset(path);
      return `<style>${escapeEmbedded(css, "style")}</style>`;
    },
  );
  out = await replaceAllAsync(
    out,
    /<script\b([^>]*?)src\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    async (match) => {
      const path = resolvePreviewAssetPath(match[3]);
      if (!path) return match[0];
      const js = await loadAsset(path);
      return `<script>${escapeEmbedded(js, "script")}</script>`;
    },
  );
  return out;
}
