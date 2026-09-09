import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function assetPath(relative) {
  const direct = resolve(relative);
  if (existsSync(direct)) return direct;
  // Makers packages includeFiles under included_files in its function bundle.
  return resolve("included_files", relative);
}
