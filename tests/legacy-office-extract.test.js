import { test } from "node:test";
import assert from "node:assert/strict";
import { extractIndexText } from "../server/file-index-extract.js";
import { extractLegacyOfficeDocument, sniffBinaryFormat } from "../server/legacy-office-extract.js";
import { buildEncryptedOfficeFile, buildLegacyWordFile } from "./legacy-doc-fixture.js";

test("WPS 导出的 docx 后缀实为 Word 97 二进制时按文件头识别并取出正文", () => {
  const bytes = buildLegacyWordFile({ text: "这个字段这样写" });
  assert.equal(sniffBinaryFormat(bytes), "cfb");
  const extracted = extractLegacyOfficeDocument({ filename: "文字文稿.docx", content: bytes });
  assert.equal(extracted.text, "这个字段这样写");
  assert.match(extracted.reason, /提取正文文字/);
});

test("扩展名是 .doc 时同样走二进制解析，不再以「暂未提供」拒绝", async () => {
  const bytes = buildLegacyWordFile({ text: "改后缀也要能读" });
  const result = await extractIndexText({
    filename: "文字文稿.doc",
    mime: "application/msword",
    content: bytes,
  });
  assert.equal(result.text, "改后缀也要能读");
  assert.equal(result.partial, true);
});

test("摘要入口按文件头分流：docx 后缀的 OLE2 文件不再落到 JSZip 报解析失败", async () => {
  const bytes = buildLegacyWordFile({ text: "入口分流" });
  const result = await extractIndexText({
    filename: "批注.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: bytes,
  });
  assert.equal(result.text, "入口分流");
  assert.doesNotMatch(result.reason, /解析失败或格式不受支持/);
});

test("尾部缺字节的文件补齐扇区后仍能提取，并在原因里说明截断", () => {
  const bytes = buildLegacyWordFile({ text: "截断文件", truncatedBy: 100 });
  const extracted = extractLegacyOfficeDocument({ filename: "截断.docx", content: bytes });
  assert.equal(extracted.text, "截断文件");
  assert.equal(extracted.truncatedBy, 100);
  assert.match(extracted.reason, /尾部缺失 100 字节/);
});

test("加密容器与旧版 xls 给出明确原因而不是「解析失败」", () => {
  const encrypted = extractLegacyOfficeDocument({
    filename: "加密.docx",
    content: buildEncryptedOfficeFile(),
  });
  assert.equal(encrypted.text, "");
  assert.equal(encrypted.encrypted, true);
  assert.match(encrypted.reason, /已加密/);
});

test("图片锚点计数不影响正文，只有文字时才回正文", () => {
  const bytes = buildLegacyWordFile({ text: "看图" });
  const extracted = extractLegacyOfficeDocument({ filename: "a.docx", content: bytes });
  assert.equal(extracted.anchors, 0);
  const docx = Buffer.from("PK\u0003\u0004not an ole2");
  const notCfb = extractLegacyOfficeDocument({ filename: "b.docx", content: docx });
  assert.equal(notCfb.text, "");
  assert.match(notCfb.reason, /不是 OLE2/);
});
