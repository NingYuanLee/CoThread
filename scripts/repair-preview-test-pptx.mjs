// 用 pptxgenjs 生成可被 PowerPoint 打开的 PPTX，并替换库中「预览测试.pptx」的内容
import { createHash } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
import PptxGenJS from "pptxgenjs";

async function buildPreviewPptxBytes() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide1 = pptx.addSlide();
  slide1.addText("PPTX 预览测试", {
    x: 0.6,
    y: 0.8,
    w: 8.8,
    h: 0.8,
    fontSize: 28,
    bold: true,
  });
  slide1.addText("第一页正文内容", {
    x: 0.6,
    y: 1.8,
    w: 8.8,
    h: 1.2,
    fontSize: 16,
  });
  const slide2 = pptx.addSlide();
  slide2.addText("第二页标题", {
    x: 0.6,
    y: 0.8,
    w: 8.8,
    h: 0.8,
    fontSize: 24,
    bold: true,
  });
  slide2.addText("第二页正文内容", {
    x: 0.6,
    y: 1.8,
    w: 8.8,
    h: 1.2,
    fontSize: 16,
  });
  return await pptx.write({ outputType: "nodebuffer" });
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const db = await createDatabase();
const bytes = await buildPreviewPptxBytes();
const sha = digest(bytes);
const rows = await query(
  db,
  `SELECT id, filename FROM versions WHERE filename = ?`,
  ["预览测试.pptx"],
);
if (!rows.length) {
  console.log("未找到「预览测试.pptx」，无需修复。");
  process.exit(0);
}
for (const row of rows) {
  await query(
    db,
    `UPDATE versions SET content = ?, byte_size = ?, sha256 = ? WHERE id = ?`,
    [bytes, bytes.length, sha, row.id],
  );
  console.log(`已修复 version ${row.id}（${row.filename}，${bytes.length} 字节）`);
}
