import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 解析随包发布的静态文件路径。
 *
 * The server can run with a cwd outside the release root, so resolve packaged
 * files beside this module as well as under the current directory.
 */
export function assetPath(relative: string): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(relative), resolve(moduleDirectory, "..", relative)];
  return candidates.find((path) => existsSync(path)) || candidates[0];
}
