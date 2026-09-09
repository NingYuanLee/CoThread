// Remove profile payloads even when an old tool encoded JSON inside text blocks.
// Real image content blocks and attachment references remain intact.
export function cleanLegacyContext(value) {
  if (typeof value === "string") {
    if (!/"(?:avatar|author_avatar|members)"\s*:/.test(value)) return value;
    try { return JSON.stringify(cleanLegacyContext(JSON.parse(value))); }
    catch { return value; }
  }
  if (Array.isArray(value)) return value.map(cleanLegacyContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["avatar", "author_avatar"].includes(key))
    .map(([key, item]) => [key, key === "members" && Array.isArray(item)
      ? item.map(({ id, name, role }) => ({ id, name, role }))
      : cleanLegacyContext(item)]));
}
