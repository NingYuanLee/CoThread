import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import XLSX from "xlsx";
import { extractIndexText } from "../server/file-index-extract.js";

test("Office 正文可供检索，同时明确尚未覆盖的图表与图片", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="urn:test"><w:p><w:r><w:t>需求 &amp; 验收</w:t></w:r></w:p></w:document>',
  );
  const content = await zip.generateAsync({ type: "nodebuffer" });
  const result = await extractIndexText({
    filename: "需求.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content,
  });
  assert.equal(result.text, "需求 & 验收");
  assert.equal(result.partial, true);
  assert.match(result.reason, /图片/);
});

test("电子表格有界提取，非 UTF-8 文本不能伪装为可靠正文", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["城市", "人数"],
      ["杭州", 12],
    ]),
    "统计",
  );
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
  const result = await extractIndexText({ filename: "数据.xlsx", content: bytes });
  assert.match(result.text, /工作表 统计/);
  assert.match(result.text, /杭州/);
  assert.equal(result.partial, true);
  const broken = await extractIndexText({
    filename: "broken.txt",
    mime: "text/plain",
    content: Buffer.from([0xff]),
  });
  assert.equal(broken.text, "");
  assert.match(broken.reason, /UTF-8/);
});
