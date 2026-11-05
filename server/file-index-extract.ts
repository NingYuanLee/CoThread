import JSZip from "jszip";
import XLSX from "xlsx";
import { isDocumentText } from "./documents/index.ts";
import { extractLegacyOfficeDocument, sniffBinaryFormat } from "./legacy-office-extract.ts";

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 1000;
const MAX_TEXT = 50000;

/** 文本提取结果。 */
export type ExtractedIndexText = { text: string; partial?: boolean; reason?: string };

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (raw, entity: string) => {
    const named = XML_ENTITIES[entity.toLowerCase()];
    if (named) return named;
    const number =
      entity[1]?.toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
    return Number.isInteger(number) &&
      number > 0 &&
      number <= 0x10ffff &&
      !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number)
      : raw;
  });
}

function xmlText(xml: string, tag: string): string {
  const escaped = tag.replace(":", "\\:");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "g");
  return [...xml.matchAll(re)].map((item) => decodeXml(item[1])).join(" ");
}

/** 有界读取电子表格：最多 20 张表、每表 200 行和 50 列。 */
function readSpreadsheet(bytes: Buffer): string {
  const book = XLSX.read(bytes, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    sheetRows: 201,
  });
  const out: string[] = [];
  for (const sheetName of book.SheetNames.slice(0, 20)) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    range.e.r = Math.min(range.e.r, range.s.r + 199);
    range.e.c = Math.min(range.e.c, range.s.c + 49);
    out.push(
      `工作表 ${sheetName}：\n${XLSX.utils
        .sheet_to_csv(sheet, {
          blankrows: false,
          range: XLSX.utils.encode_range(range),
        } as unknown as Parameters<typeof XLSX.utils.sheet_to_csv>[1])
        .slice(0, MAX_TEXT)}`,
    );
    if (out.join("\n").length >= MAX_TEXT) break;
  }
  return out.join("\n").slice(0, MAX_TEXT);
}

/** Extracts bounded text without executing file content. Unsupported inputs are explicit. */
export async function extractIndexText({
  mime,
  filename,
  content,
}: { mime?: unknown; filename?: unknown; content?: unknown } = {}): Promise<ExtractedIndexText> {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
  const name = String(filename || "").toLowerCase();
  if (isDocumentText(mime, name)) {
    const sample = bytes.subarray(0, MAX_TEXT * 4 + 4);
    if (sample.includes(0)) return { text: "", reason: "文本包含空字节，未识别正文" };
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(sample, {
        stream: sample.length < bytes.length,
      });
      const partial = sample.length < bytes.length || text.length > MAX_TEXT;
      return {
        text: text.slice(0, MAX_TEXT),
        partial,
        reason: partial ? "仅提取前 50000 字符" : "",
      };
    } catch {
      return { text: "", reason: "文本不是有效 UTF-8，未识别正文" };
    }
  }
  if (sniffBinaryFormat(bytes) === "cfb") {
    if (bytes.length > MAX_ARCHIVE_BYTES) return { text: "", reason: "文件超过提取大小限制" };
    const legacy = extractLegacyOfficeDocument({ filename: name, content: bytes }) as {
      kind?: string;
      reason?: string;
      text?: string;
    };
    if (legacy.kind === "excel") {
      try {
        return {
          text: readSpreadsheet(bytes),
          partial: true,
          reason: `${legacy.reason}最多提取 20 张表、每表 200 行和 50 列；公式与图表未覆盖`,
        };
      } catch {
        return { text: "", reason: legacy.reason };
      }
    }
    return legacy.text
      ? { text: legacy.text.slice(0, MAX_TEXT), partial: true, reason: legacy.reason }
      : { text: "", reason: legacy.reason };
  }
  if (!/\.(docx|docm|dotx|pptx|pptm|xlsx|xlsm)$/i.test(name))
    return { text: "", reason: "该格式暂未提供文本提取" };
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES)
    return { text: "", reason: "文件为空或超过提取大小限制" };
  try {
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.values(zip.files).filter((item) => !item.dir);
    let total = 0;
    for (const item of files) {
      const size = Number(
        (item as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize,
      );
      if (!Number.isSafeInteger(size) || size < 0)
        return { text: "", reason: "无法验证压缩内容大小" };
      total += size;
    }
    if (files.length > MAX_FILES || total > MAX_UNPACKED_BYTES)
      return { text: "", reason: "压缩内容超过提取限制" };
    if (/\.(docx|docm|dotx)$/i.test(name)) {
      const entry = zip.file("word/document.xml");
      if (!entry) return { text: "", reason: "未找到 Word 正文" };
      const text = xmlText(await entry.async("string"), "w:t");
      return {
        text: text.slice(0, MAX_TEXT),
        partial: true,
        reason: "提取正文文字；图片、批注等未覆盖",
      };
    }
    if (/\.(pptx|pptm)$/i.test(name)) {
      const slides = files
        .filter((item) => /^ppt\/slides\/slide\d+\.xml$/i.test(item.name))
        .sort(
          (a, b) =>
            Number(a.name.match(/slide(\d+)/i)?.[1]) - Number(b.name.match(/slide(\d+)/i)?.[1]),
        );
      const out: string[] = [];
      for (const slide of slides.slice(0, 40))
        out.push(
          `幻灯片 ${slide.name.match(/slide(\d+)/i)?.[1]}：${xmlText(await slide.async("string"), "a:t")}`,
        );
      return {
        text: out.join("\n").slice(0, MAX_TEXT),
        partial: true,
        reason: "提取最多 40 页文字；图片、备注等未覆盖",
      };
    }
    return {
      text: readSpreadsheet(bytes),
      partial: true,
      reason: "最多提取 20 张表、每表 200 行和 50 列；公式与图表未覆盖",
    };
  } catch {
    return { text: "", reason: "文件解析失败或格式不受支持" };
  }
}
