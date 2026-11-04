/**
 * 测试夹具：构造最小的 OLE2 复合文档（Word 97 二进制 .doc）。
 *
 * 目录布局：sector0 = FAT，sector1 = 目录，其后依次是两个流的数据扇区。
 * WordDocument 里放一份最小的 FIB + 一段 UTF-16LE 正文；
 * 0Table 里放一个只有单段的 piece table（CLX）。
 */

const SECTOR = 512;
const FREE = 0xffffffff;
const END = 0xfffffffe;
const FATSECT = 0xfffffffd;
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const STREAM_SIZE = 4608; // 9 个扇区，大于 4096 以免走迷你流
const TEXT_OFFSET = 2048;

function writeDirEntry(target, offset, { name, type, start, size, child = FREE }) {
  if (name) {
    const encoded = Buffer.from(`${name}\u0000`, "utf16le");
    encoded.copy(target, offset);
    target.writeUInt16LE(encoded.length, offset + 64);
  }
  target.writeUInt8(type, offset + 66);
  target.writeUInt8(1, offset + 67);
  target.writeUInt32LE(FREE, offset + 68);
  target.writeUInt32LE(FREE, offset + 72);
  target.writeUInt32LE(child, offset + 76);
  target.writeUInt32LE(start, offset + 116);
  target.writeBigUInt64LE(BigInt(size), offset + 120);
}

function sectorChain(first, count) {
  const chain = [];
  for (let index = 0; index < count; index += 1) chain.push(first + index);
  return chain;
}

function buildWordStreams(text) {
  const textBytes = Buffer.from(text, "utf16le");
  const wordDocument = Buffer.alloc(STREAM_SIZE);
  wordDocument.writeUInt16LE(0xa5ec, 0);
  wordDocument.writeUInt16LE(193, 2);
  wordDocument.writeUInt16LE(0x0004, 10); // fComplex：正文走 piece table
  wordDocument.writeUInt32LE(TEXT_OFFSET, 24);
  wordDocument.writeUInt32LE(TEXT_OFFSET + textBytes.length, 28);
  wordDocument.writeInt32LE(text.length, 76);
  wordDocument.writeUInt32LE(0, 0x01a2);
  wordDocument.writeUInt32LE(21, 0x01a6);
  textBytes.copy(wordDocument, TEXT_OFFSET);

  const table = Buffer.alloc(STREAM_SIZE);
  const pcdtLength = 8 + 8; // 2 个 CP + 1 个 PCD
  table.writeUInt8(0x02, 0);
  table.writeUInt32LE(pcdtLength, 1);
  table.writeUInt32LE(0, 5);
  table.writeUInt32LE(text.length, 9);
  table.writeUInt16LE(0, 13);
  table.writeUInt32LE(TEXT_OFFSET, 15);
  table.writeUInt16LE(0, 19);
  return { wordDocument, table };
}

function assemble(entries, streams) {
  const sectors = [];
  const fat = new Array(64).fill(FREE);
  fat[0] = FATSECT;
  fat[1] = END;
  let cursor = 2;
  for (const stream of streams) {
    const count = Math.ceil(stream.data.length / SECTOR);
    const chain = sectorChain(cursor, count);
    for (let index = 0; index < chain.length; index += 1) {
      fat[chain[index]] = index === chain.length - 1 ? END : chain[index] + 1;
    }
    entries.find((entry) => entry.name === stream.name).start = cursor;
    cursor += count;
  }
  for (let index = cursor; index < fat.length; index += 1) {
    if (index > 1 && fat[index] === FREE) fat[index] = FREE;
  }
  const dirSector = Buffer.alloc(SECTOR);
  entries.forEach((entry, index) => writeDirEntry(dirSector, index * 128, entry));
  sectors.push(dirSector);
  for (const stream of streams) {
    const padded = Buffer.alloc(Math.ceil(stream.data.length / SECTOR) * SECTOR);
    stream.data.copy(padded, 0);
    sectors.push(padded);
  }
  const fatSector = Buffer.alloc(SECTOR);
  for (let index = 0; index < SECTOR / 4; index += 1) {
    fatSector.writeUInt32LE(fat[index] ?? FREE, index * 4);
  }
  const header = Buffer.alloc(SECTOR);
  CFB_MAGIC.copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(3, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeUInt32LE(1, 48);
  header.writeUInt32LE(0, 52);
  header.writeUInt32LE(4096, 56);
  header.writeUInt32LE(END, 60);
  header.writeUInt32LE(0, 64);
  header.writeUInt32LE(END, 68);
  header.writeUInt32LE(0, 72);
  for (let index = 0; index < 109; index += 1) {
    header.writeUInt32LE(index === 0 ? 0 : FREE, 76 + index * 4);
  }
  return Buffer.concat([header, fatSector, ...sectors]);
}

/** 构造「WPS 导出的 docx 后缀、实际是 Word 97 二进制」的文件。 */
export function buildLegacyWordFile({ text = "测试正文", truncatedBy = 0 } = {}) {
  const { wordDocument, table } = buildWordStreams(text);
  const entries = [
    { name: "Root Entry", type: 5, start: END, size: 0, child: 1 },
    { name: "WordDocument", type: 2, start: 0, size: STREAM_SIZE },
    { name: "0Table", type: 2, start: 0, size: STREAM_SIZE },
    { name: "WpsCustomData", type: 2, start: 0, size: 0 },
  ];
  const streams = [
    { name: "WordDocument", data: wordDocument },
    { name: "0Table", data: table },
  ];
  const bytes = assemble(entries, streams);
  return truncatedBy > 0 ? bytes.subarray(0, bytes.length - truncatedBy) : bytes;
}

/** 构造只含 OOXML 加密容器的 OLE2 文件。 */
export function buildEncryptedOfficeFile() {
  const entries = [
    { name: "Root Entry", type: 5, start: END, size: 0, child: 1 },
    { name: "EncryptionInfo", type: 2, start: 0, size: 16 },
    { name: "EncryptedPackage", type: 2, start: 0, size: 16 },
  ];
  const streams = [
    { name: "EncryptionInfo", data: Buffer.alloc(16, 1) },
    { name: "EncryptedPackage", data: Buffer.alloc(16, 2) },
  ];
  return assemble(entries, streams);
}
