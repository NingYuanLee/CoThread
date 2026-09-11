import { createHash, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

const [file, version, url] = process.argv.slice(2);
if (!file || !version || !url || !process.env.CONNECTOR_UPDATE_PRIVATE_KEY)
  throw new Error("用法：设置 CONNECTOR_UPDATE_PRIVATE_KEY 后，传入 <exe> <version> <download-url>");
const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const signature = sign(null, Buffer.from(`${version}\n${url}\n${sha256}`), process.env.CONNECTOR_UPDATE_PRIVATE_KEY).toString("base64");
console.log(JSON.stringify({ version, url, sha256, signature }, null, 2));
