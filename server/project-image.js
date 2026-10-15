import { createHash } from "node:crypto";
import { z } from "zod/v3";

export const projectImageSchema = z
  .string()
  .max(700000)
  .refine((value) => {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2]) return false;
    if (match[1] === "png")
      return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (match[1] === "jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }, "请选择有效的 PNG、JPEG 或 WebP 项目图片（不超过 512 KiB）")
  .nullable();

export function projectImageUrl(projectId, image, prefix = "/api/projects") {
  if (!image) return null;
  const version = createHash("sha256").update(String(image)).digest("hex").slice(0, 16);
  return `${prefix}/${projectId}/image?v=${version}`;
}

export function projectImageUrlSql(idSql = "p.id", prefix = "/api/projects") {
  if (!/^\/api\/[a-z0-9/-]+$/.test(prefix)) throw new Error("项目图片地址前缀无效");
  return `CASE WHEN p.image IS NULL OR p.image='' THEN NULL ELSE CONCAT('${prefix}/',${idSql},'/image?v=',LEFT(SHA2(p.image,256),16)) END`;
}

export function parseStoredImage(value) {
  return typeof value === "string"
    ? value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
    : null;
}
