/**
 * 旧版 Office 二进制（OLE2 复合文档）正文提取。
 *
 * 背景：WPS「在线文档」另存/导出时会把 Word 97-2003 二进制 `.doc` 直接命名成 `.docx`，
 * 于是按扩展名分流的解析器（JSZip）必然失败；这类文件在文件头里是 `D0 CF 11 E0`，
 * 内部是 `WordDocument` + `0Table` 流。另外下载中断会让文件长度不是 512 字节整数倍，
 * 严格解析器会判定截断。本模块只做「只读提取」，不执行文件内容，不写库。
 *
 * 覆盖：
 * - OLE2/CFB 容器解析（FAT、目录项、迷你流），尾部缺字节时在内存里按扇区补零；
 * - Word 97+（nFib 193）按 FIB 的 fcClx/lcbClx 解析 piece table 取正文；
 * - OOXML 加密容器（EncryptionInfo + EncryptedPackage）明确返回「已加密」；
 * - 旧版 .xls/.ppt 明确返回「暂未提供文本提取」，不误判。
 */

const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]);
const SECTOR = 512;
const END_OF_CHAIN = 0xfffffffe;
const FREE_SECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;

/** 按文件头判断真实容器格式，不信任扩展名。 */
export function sniffBinaryFormat(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content || "");
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(CFB_MAGIC)) return "cfb";
  if (bytes.length >= 4 && bytes.subarray(0, 2).equals(ZIP_MAGIC)) return "zip";
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "{\\rtf") return "rtf";
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  return "unknown";
}

class CompoundFile {
  constructor(raw) {
    if (!Buffer.isBuffer(raw) || raw.length < SECTOR) throw new Error("文件短于复合文档头");
    const pad = (SECTOR - (raw.length % SECTOR)) % SECTOR;
    this.bytes = pad ? Buffer.concat([raw, Buffer.alloc(pad)]) : raw;
    this.truncatedBy = pad;
    this.sectorSize = 1 << this.bytes.readUInt16LE(30);
    this.miniSectorSize = 1 << this.bytes.readUInt16LE(32);
    this.miniCutoff = this.bytes.readUInt32LE(56) || 4096;
    this.sectorCount = Math.floor((this.bytes.length - SECTOR) / this.sectorSize);
    this._readFat();
    this._readDirectory();
    this._readMiniFat();
  }

  _sectorOffset(sector) {
    return SECTOR + sector * this.sectorSize;
  }

  _sectorSlice(sector) {
    const offset = this._sectorOffset(sector);
    if (offset >= this.bytes.length) return null;
    return this.bytes.subarray(offset, Math.min(offset + this.sectorSize, this.bytes.length));
  }

  _readFat() {
    const difat = [];
    for (let index = 0; index < 109; index += 1) {
      const sector = this.bytes.readUInt32LE(76 + index * 4);
      if (sector !== FREE_SECT) difat.push(sector);
    }
    let next = this.bytes.readUInt32LE(68);
    const declared = this.bytes.readUInt32LE(72);
    for (let guard = 0; guard <= declared + 8; guard += 1) {
      if (next === END_OF_CHAIN || next === FREE_SECT) break;
      const slice = this._sectorSlice(next);
      if (!slice) break;
      for (let index = 0; index < 127; index += 1) {
        const sector = slice.readUInt32LE(index * 4);
        if (sector !== FREE_SECT) difat.push(sector);
      }
      next = slice.readUInt32LE(127 * 4);
    }
    this.fat = [];
    for (const sector of difat) {
      const slice = this._sectorSlice(sector);
      if (!slice) continue;
      for (let index = 0; index < slice.length / 4; index += 1) {
        this.fat.push(slice.readUInt32LE(index * 4));
      }
    }
  }

  _chain(start) {
    const out = [];
    let current = start;
    while (
      current !== END_OF_CHAIN &&
      current !== FREE_SECT &&
      current !== FATSECT &&
      current !== DIFSECT
    ) {
      if (current >= this.fat.length || out.includes(current)) break;
      out.push(current);
      current = this.fat[current];
    }
    return out;
  }

  _readDirectory() {
    const first = this.bytes.readUInt32LE(48);
    const parts = [];
    for (const sector of this._chain(first)) {
      const slice = this._sectorSlice(sector);
      if (slice) parts.push(slice);
    }
    const blob = Buffer.concat(parts);
    this.entries = [];
    for (let offset = 0; offset + 128 <= blob.length; offset += 128) {
      const nameLength = blob.readUInt16LE(offset + 64);
      if (nameLength < 2) continue;
      const name = blob
        .subarray(offset, offset + nameLength - 2)
        .toString("utf16le")
        .replace(/\u0000/g, "");
      if (!name) continue;
      this.entries.push({
        name,
        type: blob[offset + 66],
        start: blob.readUInt32LE(offset + 116),
        size: Number(blob.readBigUInt64LE(offset + 120)),
      });
    }
  }

  _readMiniFat() {
    this.miniFat = [];
    const first = this.bytes.readUInt32LE(60);
    if (first === END_OF_CHAIN || first === FREE_SECT) return;
    const parts = [];
    for (const sector of this._chain(first)) {
      const slice = this._sectorSlice(sector);
      if (slice) parts.push(slice);
    }
    const blob = Buffer.concat(parts);
    for (let offset = 0; offset + 4 <= blob.length; offset += 4) {
      this.miniFat.push(blob.readUInt32LE(offset));
    }
  }

  rootEntry() {
    return this.entries.find((entry) => entry.type === 5) || null;
  }

  names() {
    return this.entries.map((entry) => entry.name);
  }

  read(name) {
    const entry = this.entries.find((item) => item.name === name);
    if (!entry) return null;
    if (entry.size === 0) return Buffer.alloc(0);
    if (entry.type === 2 && entry.size < this.miniCutoff) return this._readMiniStream(entry);
    return this._readChainStream(entry);
  }

  _readChainStream(entry) {
    const parts = [];
    let collected = 0;
    for (const sector of this._chain(entry.start)) {
      const slice = this._sectorSlice(sector);
      if (!slice) break;
      parts.push(slice);
      collected += slice.length;
      if (collected >= entry.size) break;
    }
    return Buffer.concat(parts).subarray(0, entry.size);
  }

  _readMiniStream(entry) {
    const root = this.rootEntry();
    if (!root) return Buffer.alloc(0);
    const miniStream = this._readChainStream(root);
    const parts = [];
    let collected = 0;
    let current = entry.start;
    const visited = new Set();
    while (
      current !== END_OF_CHAIN &&
      current !== FREE_SECT &&
      collected < entry.size &&
      !visited.has(current)
    ) {
      visited.add(current);
      if (current >= this.miniFat.length) break;
      const start = current * this.miniSectorSize;
      const slice = miniStream.subarray(start, start + this.miniSectorSize);
      if (!slice.length) break;
      parts.push(slice);
      collected += slice.length;
      current = this.miniFat[current];
    }
    return Buffer.concat(parts).subarray(0, entry.size);
  }
}

function whichTableStream(wordDocument) {
  const flags = wordDocument.readUInt16LE(10);
  return (flags >> 9) & 1 ? "1Table" : "0Table";
}

function decodePiece(wordDocument, fcRaw, chars) {
  const compressed = (fcRaw & 0x40000000) !== 0;
  const fc = (fcRaw & 0x3fffffff) >>> 0;
  if (compressed) {
    const offset = Math.floor(fc / 2);
    return wordDocument.subarray(offset, offset + chars).toString("latin1");
  }
  return wordDocument.subarray(fc, fc + chars * 2).toString("utf16le");
}

/** 从 piece table 取正文；非复杂文档回退到 fcMin..fcMac。 */
export function readWord97Text(wordDocument, table, ccpText) {
  const fcClx = wordDocument.readUInt32LE(0x01a2);
  const lcbClx = wordDocument.readUInt32LE(0x01a6);
  const flags = wordDocument.readUInt16LE(10);
  const usePieceTable = ((flags >> 2) & 1) === 1;
  let text = "";
  if (usePieceTable && lcbClx > 0 && fcClx + lcbClx <= table.length) {
    const clx = table.subarray(fcClx, fcClx + lcbClx);
    let cursor = 0;
    while (cursor < clx.length) {
      const kind = clx[cursor];
      if (kind === 0x01) {
        cursor += 3 + clx.readUInt16LE(cursor + 1);
      } else if (kind === 0x02) {
        const pcdtLength = clx.readUInt32LE(cursor + 1);
        const pcdt = clx.subarray(cursor + 5, cursor + 5 + pcdtLength);
        const pieces = Math.floor((pcdt.length - 4) / 12);
        if (pieces > 0) {
          const cps = [];
          for (let index = 0; index <= pieces; index += 1) {
            cps.push(pcdt.readUInt32LE(index * 4));
          }
          const parts = [];
          for (let index = 0; index < pieces; index += 1) {
            const fcRaw = pcdt.readUInt32LE(4 * (pieces + 1) + index * 8 + 2);
            parts.push(decodePiece(wordDocument, fcRaw, cps[index + 1] - cps[index]));
          }
          text = parts.join("");
        }
        break;
      } else {
        break;
      }
    }
  }
  if (!text) {
    const fcMin = wordDocument.readUInt32LE(24);
    const fcMac = wordDocument.readUInt32LE(28);
    const raw = wordDocument.subarray(fcMin, fcMac);
    text = ccpText > 0 ? raw.subarray(0, ccpText * 2).toString("utf16le") : raw.toString("utf16le");
  }
  return text;
}

/**
 * Word 控制字符清理：域代码（\x13 指令 \x14 结果 \x15）只保留结果，
 * 图片/对象锚点（\x01、\x08）替换为占位符，段落与换行归一。
 */
export function cleanWordText(raw) {
  const anchors = (raw.match(/[\u0001\u0008]/g) || []).length;
  let phase = "body";
  let out = "";
  for (const char of raw) {
    if (char === "\u0013") {
      phase = "fieldCode";
      continue;
    }
    if (char === "\u0014") {
      phase = "fieldResult";
      continue;
    }
    if (char === "\u0015") {
      phase = "body";
      continue;
    }
    if (char === "\r" || char === "\u000b") {
      out += "\n";
      continue;
    }
    if (char === "\u000c") continue;
    if (char === "\u0007") {
      out += "\t";
      continue;
    }
    if (char === "\u0001" || char === "\u0008") {
      out += "[图]";
      continue;
    }
    if (phase === "fieldCode") continue;
    if (char === "\u0000") continue;
    out += char;
  }
  return { text: out, anchors };
}

function describeStreams(cfb) {
  return cfb
    .names()
    .filter((name) => name && !/^\u0005/.test(name))
    .map((name) => {
      const entry = cfb.entries.find((item) => item.name === name);
      return `${name}(${entry.size}B)`;
    });
}

/**
 * 提取旧版 Office 二进制正文。
 * 返回 { text, reason, encrypted, truncatedBy, anchors, streams }，永不抛错。
 */
export function extractLegacyOfficeDocument({ filename = "", content } = {}) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content || []);
  const name = String(filename || "").toLowerCase();
  if (!bytes.length) return { text: "", reason: "文件为空" };
  if (sniffBinaryFormat(bytes) !== "cfb") {
    return { text: "", reason: "不是 OLE2 复合文档" };
  }
  let cfb;
  try {
    cfb = new CompoundFile(bytes);
  } catch (error) {
    return { text: "", reason: `复合文档结构无法解析：${error.message}` };
  }
  const names = cfb.names();
  const prefix = [];
  if (cfb.truncatedBy)
    prefix.push(`文件尾部缺失 ${cfb.truncatedBy} 字节（疑为下载不完整），已按扇区补齐后解析`);
  if (names.includes("WpsCustomData")) prefix.push("文件由 WPS 保存");
  const lead = prefix.length ? `${prefix.join("；")}。` : "";
  const streams = describeStreams(cfb);

  if (names.includes("EncryptionInfo") && names.includes("EncryptedPackage")) {
    return {
      text: "",
      kind: "encrypted",
      encrypted: true,
      truncatedBy: cfb.truncatedBy,
      streams,
      reason: `${lead}文档已加密（OOXML 加密容器），需先解密后重新上传。`,
    };
  }
  const wordDocument = cfb.read("WordDocument");
  if (!wordDocument) {
    if (names.includes("Workbook") || names.includes("Book"))
      return { text: "", kind: "excel", streams, reason: `${lead}这是旧版 Excel(.xls)。` };
    if (names.includes("PowerPoint Document"))
      return {
        text: "",
        kind: "powerpoint",
        streams,
        reason: `${lead}这是旧版 PowerPoint(.ppt)，暂未提供文本提取。`,
      };
    return {
      text: "",
      kind: "unknown",
      streams,
      reason: `${lead}OLE2 容器内没有可识别的 Word 正文（${name || "无扩展名"}）。`,
    };
  }
  if (wordDocument.length < 0x01aa)
    return { text: "", streams, reason: `${lead}Word 正文头不完整。` };
  if (wordDocument.readUInt16LE(0) !== 0xa5ec) {
    return { text: "", streams, reason: `${lead}不是 Word 97 及以上的二进制格式。` };
  }
  const flags = wordDocument.readUInt16LE(10);
  if ((flags >> 8) & 1) return { text: "", streams, reason: `${lead}Word 文档已加密，需先解密。` };
  const ccpText = wordDocument.readInt32LE(76);
  const tableName = whichTableStream(wordDocument);
  const table = cfb.read(tableName) || Buffer.alloc(0);
  let raw;
  try {
    raw = readWord97Text(wordDocument, table, ccpText);
  } catch (error) {
    return { text: "", streams, reason: `${lead}Word 正文解析失败：${error.message}` };
  }
  const { text, anchors } = cleanWordText(raw);
  const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!trimmed) {
    return { text: "", streams, reason: `${lead}正文为空或仅含图片、批注。` };
  }
  const notes = ["提取正文文字"];
  if (anchors) notes.push(`另有 ${anchors} 处图片/对象，内容未读取`);
  return {
    text: trimmed,
    kind: "word",
    truncatedBy: cfb.truncatedBy,
    anchors,
    streams,
    reason: `${lead}${notes.join("；")}。`,
  };
}
