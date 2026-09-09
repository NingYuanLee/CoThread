import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assetPath(relative) {
  // Agents can start with a cwd outside their bundle. Resolve packaged files
  // beside this module as well as the ordinary cloud-function/local layouts.
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(relative), resolve("included_files", relative),
    resolve(moduleDirectory, "included_files", relative),
    resolve(moduleDirectory, "..", relative)];
  return candidates.find((path) => existsSync(path)) || candidates[1];
}
