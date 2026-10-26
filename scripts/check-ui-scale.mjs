/** 可缩放长度必须是 rem。允许留下的 px 只有根字号倍率、1px 边框和描边补偿。 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertWebTree } from "./ui-lengths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const changed = convertWebTree(root, false);
if (changed.length) {
  console.error("以下文件仍有应按 rem 缩放的 px（1rem = 14px，高分辨率）：");
  for (const file of changed) console.error(file);
  process.exit(1);
}
