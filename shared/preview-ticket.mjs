import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_TICKET_PREFIX = "~t~";

function previewSigningKey() {
  const raw =
    process.env.CREDENTIAL_ENCRYPTION_KEY
    || process.env.DATABASE_URL
    || process.env.TEST_DATABASE_URL
    || "cothread-preview-ticket";
  return createHash("sha256").update(String(raw)).digest();
}

export function signPreviewTicket(userId, versionId, ttlMs = 6 * 60 * 60 * 1000) {
  const payload = Buffer.from(
    JSON.stringify({
      u: String(userId || ""),
      v: String(versionId || ""),
      e: Date.now() + Number(ttlMs || 0),
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", previewSigningKey()).update(payload).digest("base64url");
  return `${PREVIEW_TICKET_PREFIX}${payload}.${sig}`;
}

export function readPreviewTicket(ticket) {
  const text = String(ticket || "");
  if (!text.startsWith(PREVIEW_TICKET_PREFIX)) return null;
  const body = text.slice(PREVIEW_TICKET_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const expected = createHmac("sha256", previewSigningKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const userId = String(data?.u || "");
    const versionId = String(data?.v || "");
    const exp = Number(data?.e);
    if (!userId || !versionId || !Number.isFinite(exp) || exp < Date.now()) return null;
    return { userId, versionId, exp };
  } catch {
    return null;
  }
}

export function splitPreviewAssetPath(assetPath) {
  const raw = String(assetPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const match = raw.match(new RegExp(`^${PREVIEW_TICKET_PREFIX}([A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)(?:/(.*))?$`));
  if (!match) return { ticket: "", path: raw };
  return {
    ticket: `${PREVIEW_TICKET_PREFIX}${match[1]}`,
    path: match[2] || "",
  };
}
