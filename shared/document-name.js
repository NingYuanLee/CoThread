export function fileSuffix(filename) {
  const file = String(filename || "").trim();
  const dot = file.lastIndexOf(".");
  return dot > 0 && dot < file.length - 1 ? file.slice(dot) : "";
}

export function fileDisplayName({ title, filename } = {}) {
  const name = String(title || "").trim() || String(filename || "").trim() || "文档";
  const suffix = fileSuffix(filename);
  return suffix && !name.toLowerCase().endsWith(suffix.toLowerCase())
    ? `${name}${suffix}`
    : name;
}

export function isImageFile(version) {
  const mime = String(version?.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = typeof version === "string" ? version : String(version?.filename || version?.title || "");
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
}

export function nextDuplicateName(desired, taken) {
  const name = String(desired || "").trim().slice(0, 160) || "文档";
  const used = new Set([...taken].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0 && !name.slice(dot + 1).includes(" ");
  const stem = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : "";
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem} (${n})${ext}`.slice(0, 160);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`.slice(0, 160);
}

export function uniqueDisplayTitle(desiredTitle, desiredFilename, taken) {
  const title = String(desiredTitle || "").trim().slice(0, 160) || "文档";
  const filename = String(desiredFilename || "").trim();
  const uniqueName = nextDuplicateName(
    fileDisplayName({ title, filename }),
    [...taken].map((item) => typeof item === "string" ? item : fileDisplayName(item)),
  );
  const suffix = fileSuffix(filename);
  if (suffix && uniqueName.toLowerCase().endsWith(suffix.toLowerCase()) && !title.toLowerCase().endsWith(suffix.toLowerCase()))
    return uniqueName.slice(0, uniqueName.length - suffix.length);
  return uniqueName;
}
