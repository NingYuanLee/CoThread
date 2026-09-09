import { registerHooks } from "node:module";

// The local repository must not mask dependencies missing from the deployment.
// Native addons may legitimately extract binaries into the system temp folder.
const root = process.env.COTHREAD_PACKAGE_CHECK_ROOT;
if (!root) throw new Error("Missing package verification root");
registerHooks({ resolve(specifier, context, next) {
  const result = next(specifier, context);
  if (context.parentURL?.startsWith(root) && result.url.startsWith("file:")
    && result.url.includes("/node_modules/") && !result.url.startsWith(root)) {
    throw new Error(`Dependency missing from Agent package: ${specifier}`);
  }
  return result;
} });
