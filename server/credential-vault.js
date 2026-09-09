import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

let keyPromise;
async function loadKey() {
  if (process.env.CREDENTIAL_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY 必须是 32 字节的 base64 密钥");
    return key;
  }
  const path = resolve(".local/credential-encryption.key");
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const key = await readFile(path);
  if (key.length !== 32) throw new Error("账号令牌加密密钥无效");
  return key;
}
const key = () => keyPromise ??= loadKey();
export async function encryptToken(token, userId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const content = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString("base64")).join(".");
}
export async function decryptToken(value, userId) {
  const [iv, tag, content] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(content), cipher.final()]).toString("utf8");
}
