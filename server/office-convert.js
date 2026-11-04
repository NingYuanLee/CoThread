/**
 * 旧版二进制 Office → OOXML 的预览转换。
 *
 * 只转换 OLE2 复合文档（`.doc/.xls/.ppt`，包括 WPS 把 `.doc` 存成 `.docx` 后缀的情况），
 * 目标格式供前端现有 docx-preview / xlsx / pptx 预览复用。转换后端可配置：
 *
 * - `COTHREAD_DSOFFICE_CLI`：@deepseek-ai/libreoffice-kit 的 `cli.js`，用当前 Node 执行
 *   `convert --input --output`；Linux 上该包使用 WASM 引擎，不需要系统安装 LibreOffice。
 * - `COTHREAD_SOFFICE_BIN`（默认 `soffice`）：系统 LibreOffice 的 `--headless --convert-to`。
 *
 * 两种后端都在临时目录内工作、有超时与大小上限，产物必须通过 OOXML 文件头校验。
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractLegacyOfficeDocument, sniffBinaryFormat } from "./legacy-office-extract.js";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = Math.max(
  10_000,
  Number(process.env.COTHREAD_OFFICE_CONVERT_TIMEOUT_MS) || 120_000,
);

const TARGETS = {
  word: {
    kind: "docx",
    inputExtension: "doc",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  excel: {
    kind: "xlsx",
    inputExtension: "xls",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  powerpoint: {
    kind: "pptx",
    inputExtension: "ppt",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
};

/** 已安装 @deepseek-ai/libreoffice-kit 时直接用它，无需配置环境变量。 */
function installedKitCli() {
  try {
    return createRequire(import.meta.url).resolve("@deepseek-ai/libreoffice-kit/cli");
  } catch {
    return "";
  }
}

/** 转换后端是否已配置；诊断接口与日志使用。 */
export function officeConverterStatus() {
  if (process.env.COTHREAD_DSOFFICE_CLI)
    return { backend: "dsoffice", cli: process.env.COTHREAD_DSOFFICE_CLI, available: true };
  const cli = installedKitCli();
  if (cli) return { backend: "dsoffice", cli, available: true };
  return {
    backend: "soffice",
    bin: process.env.COTHREAD_SOFFICE_BIN || "soffice",
    available: true,
  };
}

/**
 * 判断这个版本是否需要生成预览派生文件。
 * 返回 { supported:true, kind, inputExtension, mime, filename, reason } 或不支持的原因。
 */
export function planOfficeRendition(filename, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content || "");
  if (!bytes.length) return { supported: false, reason: "文件为空。" };
  if (bytes.length > MAX_INPUT_BYTES)
    return { supported: false, reason: "文件超过预览转换大小限制（8 MiB）。" };
  if (sniffBinaryFormat(bytes) !== "cfb")
    return { supported: false, reason: "该文件已是 OOXML 或不是旧版二进制 Office。" };
  const legacy = extractLegacyOfficeDocument({ filename, content: bytes });
  const target = TARGETS[legacy.kind];
  if (!target) return { supported: false, reason: legacy.reason || "该文件暂不支持预览转换。" };
  return {
    supported: true,
    kind: target.kind,
    inputExtension: target.inputExtension,
    mime: target.mime,
    filename: renditionFilename(filename, target.kind),
    reason: legacy.reason || "",
  };
}

function renditionFilename(filename, kind) {
  const base = String(filename || "document").replace(/\.[^.]+$/, "") || "document";
  return `${base}.${kind}`;
}

function converterCommand({ inputPath, outputPath, workDir }) {
  const cli = process.env.COTHREAD_DSOFFICE_CLI || installedKitCli();
  if (cli)
    return {
      command: process.execPath,
      args: [cli, "convert", "--input", inputPath, "--output", outputPath],
      expectedPath: outputPath,
    };
  const bin = process.env.COTHREAD_SOFFICE_BIN || "soffice";
  const profile = join(workDir, "profile").replace(/\\/g, "/");
  return {
    command: bin,
    args: [
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard",
      `-env:UserInstallation=file:///${profile}`,
      "--convert-to",
      outputPath.split(".").pop(),
      "--outdir",
      workDir,
      inputPath,
    ],
    expectedPath: join(workDir, `input.${outputPath.split(".").pop()}`),
  };
}

function runProcess({ command, args, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`转换超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        error.code === "ENOENT"
          ? new Error("未找到转换后端：请安装 LibreOffice 或配置 COTHREAD_DSOFFICE_CLI")
          : error,
      );
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`转换进程退出码 ${code}`));
    });
  });
}

/** 校验产物是目标 OOXML（ZIP 容器且包含对应主文档部件）。 */
export function isOoxmlRendition(buffer, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  const markers = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  };
  const marker = markers[kind];
  return marker ? buffer.includes(Buffer.from(marker, "latin1")) : false;
}

/** 旧版二进制 Office 被截断时（下载不完整）补零到扇区边界，否则转换器会拒收。 */
function withSectorPadding(content) {
  const remainder = content.length % 512;
  return remainder === 0 ? content : Buffer.concat([content, Buffer.alloc(512 - remainder)]);
}

/**
 * 执行一次转换。成功返回 { content, filename, mime }，失败抛错（由调用方记录原因）。
 */
export async function convertToOoxml({ content, plan, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!plan?.supported) throw new Error(plan?.reason || "该文件不支持预览转换");
  const workDir = await mkdtemp(join(tmpdir(), "cothread-rendition-"));
  try {
    const inputPath = join(workDir, `input.${plan.inputExtension}`);
    const outputPath = join(workDir, `output.${plan.kind}`);
    await writeFile(inputPath, withSectorPadding(content));
    const command = converterCommand({ inputPath, outputPath, workDir });
    await runProcess({ ...command, timeoutMs });
    const output = await readFile(command.expectedPath);
    if (!isOoxmlRendition(output, plan.kind))
      throw new Error("转换结果不是有效的 OOXML 文件，已放弃使用");
    return { content: output, filename: plan.filename, mime: plan.mime };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
