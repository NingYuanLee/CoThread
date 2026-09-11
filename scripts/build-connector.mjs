import { access, copyFile, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { rcedit } from "rcedit";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-connector");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = process.env.CONNECTOR_BUILD_VERSION || pkg.version;
const server = process.env.CONNECTOR_SERVER_URL || "https://cothread.z2l.top";
const publicKey = (process.env.CONNECTOR_UPDATE_PUBLIC_KEY || "").replace(/\r?\n/g, "\\n");
const guiScript = (await readFile(join(root, "connector", "gui.ps1"))).toString("base64");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const iconFrames = await Promise.all(iconSizes.map((size) =>
  sharp(join(root, "public", "cothread-logo.svg")).resize(size, size).png().toBuffer()));
const directorySize = 6 + iconFrames.length * 16;
const icon = Buffer.alloc(directorySize + iconFrames.reduce((total, frame) => total + frame.length, 0));
icon.writeUInt16LE(1, 2);
icon.writeUInt16LE(iconFrames.length, 4);
let imageOffset = directorySize;
for (let index = 0; index < iconFrames.length; index++) {
  const entryOffset = 6 + index * 16;
  icon[entryOffset] = iconSizes[index] === 256 ? 0 : iconSizes[index];
  icon[entryOffset + 1] = icon[entryOffset];
  icon.writeUInt16LE(1, entryOffset + 4);
  icon.writeUInt16LE(32, entryOffset + 6);
  icon.writeUInt32LE(iconFrames[index].length, entryOffset + 8);
  icon.writeUInt32LE(imageOffset, entryOffset + 12);
  iconFrames[index].copy(icon, imageOffset);
  imageOffset += iconFrames[index].length;
}
const iconPath = join(out, "cothread.ico");
await writeFile(iconPath, icon);
const source = (await readFile(join(root, "connector", "main.cjs"), "utf8"))
  .replace("__CONNECTOR_VERSION__", version)
  .replace("__CONNECTOR_SERVER__", server)
  .replace("__UPDATE_PUBLIC_KEY__", publicKey)
  .replace("__GUI_SCRIPT_BASE64__", guiScript)
  .replace("__CONNECTOR_ICON_BASE64__", icon.toString("base64"));
const entry = join(out, "connector.cjs"), blob = join(out, "sea-prep.blob"), exe = join(out, "CoThreadConnector.exe");
await writeFile(entry, source);
await writeFile(join(out, "sea-config.json"), JSON.stringify({ main: entry, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }, null, 2));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} 执行失败`);
};
const runWithRetry = async (command, args, attempts = 5) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = spawnSync(command, args, { cwd: root, stdio: attempt === attempts ? "inherit" : "ignore", windowsHide: true });
    if (result.status === 0) return;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw new Error(`${command} 执行失败`);
};
async function findSignTool() {
  if (process.env.SIGNTOOL_PATH) return process.env.SIGNTOOL_PATH;
  const kits = join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  try {
    const versions = (await readdir(kits, { withFileTypes: true })).filter((entry) => entry.isDirectory())
      .map((entry) => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = join(kits, version, "x64", "signtool.exe");
      try { await access(candidate); return candidate; } catch {}
    }
  } catch {}
  return null;
}
run(process.execPath, ["--experimental-sea-config", join(out, "sea-config.json")]);
await copyFile(process.execPath, exe);
const signTool = await findSignTool();
if (!signTool) throw new Error("未找到 Windows SDK signtool.exe，无法在 SEA 注入前移除 Node 原始签名");
await runWithRetry(signTool, ["remove", "/s", exe]);
await rcedit(exe, {
  icon: iconPath,
  "file-version": version,
  "product-version": version,
  "version-string": { ProductName: "CoThread Connector", FileDescription: "共序本地连接器", CompanyName: "CoThread" },
  "requested-execution-level": "asInvoker",
});
const postject = join(root, "node_modules", "postject", "dist", "cli.js");
run(process.execPath, [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
// Node ships as a console executable. Switch only the PE subsystem field so a
// double-clicked connector opens the WPF window without an extra console.
const executable = await open(exe, "r+");
try {
  const dos = Buffer.alloc(64);
  await executable.read(dos, 0, dos.length, 0);
  const peOffset = dos.readUInt32LE(0x3c);
  const signature = Buffer.alloc(4);
  await executable.read(signature, 0, 4, peOffset);
  if (signature.toString("binary") !== "PE\0\0") throw new Error("生成文件不是有效的 Windows PE 可执行文件");
  const guiSubsystem = Buffer.from([2, 0]);
  await executable.write(guiSubsystem, 0, 2, peOffset + 24 + 68);
} finally { await executable.close(); }
if (process.env.CONNECTOR_CODESIGN_CERT_SHA1) {
  const timestamp = process.env.CONNECTOR_CODESIGN_TIMESTAMP_URL || "http://timestamp.digicert.com";
  run(signTool, ["sign", "/sha1", process.env.CONNECTOR_CODESIGN_CERT_SHA1, "/fd", "SHA256", "/tr", timestamp, "/td", "SHA256", exe]);
  run(signTool, ["verify", "/pa", "/v", exe]);
}
console.log(`Built ${exe} (v${version})`);
