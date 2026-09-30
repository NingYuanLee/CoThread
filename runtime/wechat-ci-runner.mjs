/**
 * Isolated WeChat CI runner.
 *
 * miniprogram-ci forks its own compiler subprocess, and a provider error there
 * can escape as an uncaught exception that terminates the hosting process. That
 * was observed for real: a rejected preview took the whole API down. Running the
 * release step in its own process keeps a provider failure from killing CoThread.
 *
 * Protocol: `node wechat-ci-runner.mjs <request.json> <result.json>`.
 * The result file is always written when the library returns or throws; a hard
 * crash leaves no result file and the parent treats the exit code as the signal.
 */
import { readFile, writeFile } from "node:fs/promises";

const [requestPath, resultPath] = process.argv.slice(2);
if (!requestPath || !resultPath) {
  console.error("usage: wechat-ci-runner <request.json> <result.json>");
  process.exit(2);
}

let log = "";
const collect = (update) => {
  log += `${typeof update === "string" ? update : JSON.stringify(update)}\n`;
  if (log.length > 200_000) log = log.slice(-100_000);
};

async function main() {
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  const mod = await import("miniprogram-ci");
  const ci = mod.default ?? mod;
  const project = new ci.Project({
    appid: request.appid,
    type: "miniProgram",
    projectPath: request.projectPath,
    privateKeyPath: request.privateKeyPath,
    ignores: ["node_modules/**/*"],
  });
  if (request.action === "preview") {
    const result = await ci.preview({
      project,
      desc: request.desc,
      setting: { useProjectConfig: true },
      qrcodeFormat: "image",
      qrcodeOutputDest: request.qrcodeOutputDest,
      robot: request.robot,
      ...(request.pagePath ? { pagePath: request.pagePath } : {}),
      onProgressUpdate: collect,
    });
    await writeFile(resultPath, JSON.stringify({ ok: true, result, log }), "utf8");
    return;
  }
  const result = await ci.upload({
    project,
    version: request.version,
    desc: request.desc,
    setting: { useProjectConfig: true },
    robot: request.robot,
    onProgressUpdate: collect,
  });
  await writeFile(resultPath, JSON.stringify({ ok: true, result, log }), "utf8");
}

try {
  await main();
  process.exit(0);
} catch (error) {
  const detail = String(error?.message || error);
  try {
    await writeFile(resultPath, JSON.stringify({ ok: false, error: detail, log }), "utf8");
  } catch {}
  console.error(detail);
  process.exit(1);
}
