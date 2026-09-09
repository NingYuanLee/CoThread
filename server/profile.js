import { z } from "zod/v3";
import { IDENTITY_TAGS } from "../shared/profile.js";

const avatar = z
  .string()
  .max(700000)
  .refine((value) => {
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 512 * 1024 || bytes.toString("base64") !== match[2])
      return false;
    if (match[1] === "png")
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (match[1] === "jpeg")
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    return (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }, "请选择有效的 PNG、JPEG 或 WebP 头像（不超过 512 KiB）")
  .nullable();

export const profileSchema = z
  .object({
    name: z.string().trim().min(1, "姓名不能为空").max(80),
    motto: z.string().trim().max(200),
    identity_tags: z
      .array(
        z.string().refine((tag) => IDENTITY_TAGS.includes(tag), "身份标签无效"),
      )
      .max(1, "只能选择一个角色标签"),
    avatar,
  })
  .strict();

export function personalProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    motto: user.motto ?? "",
    identity_tags:
      typeof user.identity_tags === "string"
        ? JSON.parse(user.identity_tags)
        : (user.identity_tags ?? []),
  };
}
