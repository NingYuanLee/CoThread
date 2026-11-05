import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

let keyPromise: Promise<Buffer> | undefined;

async function loadKey(): Promise<Buffer> {
  if (process.env.CREDENTIAL_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64");
    if (key.length !== 32)
      throw new Error("CREDENTIAL_ENCRYPTION_KEY 必须是 32 字节的 base64 密钥");
    return key;
  }
  // 兼容历史本机文件；不再自动创建，密钥须人工配置到环境变量。
  const path = resolve(".local/credential-encryption.key");
  try {
    const key = await readFile(path);
    if (key.length !== 32) throw new Error("账号令牌加密密钥无效");
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  throw new Error(
    "请人工配置 CREDENTIAL_ENCRYPTION_KEY（32 字节 base64），并长期固定；setup 不会自动生成",
  );
}

const key = (): Promise<Buffer> => (keyPromise ??= loadKey());

/** 用 AES-256-GCM 加密账号令牌，返回 `iv.tag.content` 的 base64 拼接。 */
export async function encryptToken(token: string, userId: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const content = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString("base64")).join(".");
}

/** 解密 `encryptToken` 的产物；AAD 绑定 userId，换人即解不开。 */
export async function decryptToken(value: string, userId: string): Promise<string> {
  const [iv, tag, content] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(content), cipher.final()]).toString("utf8");
}
