import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";

const db = await createDatabase();
try {
  const [project] = await query(db, "SELECT id,name,created_by FROM projects WHERE name=? ORDER BY created_at LIMIT 1", ["工序点产品研发"]);
  if (!project) throw new Error("未找到项目「工序点产品研发」");
  const [user] = await query(db, "SELECT id,name,email FROM users WHERE id=?", [project.created_by]);
  if (!user) throw new Error("项目负责人不存在");
  let [thread] = await query(db, "SELECT id,title FROM threads WHERE project_id=? AND status='active' ORDER BY created_at DESC LIMIT 1", [project.id]);
  const actor = { ...user, kind: "session" };
  const service = new Service(db);
  if (!thread) thread = await service.createThread(actor, project.id, { title: "文档阅览测试" });
  const samples = [
    ["阅览测试 · Markdown", "阅览测试.md", "# 文件阅览测试\n\n这是一份用于验证 Markdown 阅读体验的样例。\n\n## 内容结构\n\n- 标题、列表和引用\n- **粗体**、行内代码\n- GFM 表格和任务列表\n\n> HTML、Office、Markdown 和代码文件应当使用各自的阅读表面。\n\n| 文件类型 | 预期体验 |\n| --- | --- |\n| Markdown | 文档排版阅读 |\n| HTML | 保留资源与脚本交互 |\n| TXT / LOG / ENV | 等宽文本阅读 |\n\n代码块示例：const preview = previewValue;\n", "text/markdown"],
    ["阅览测试 · 纯文本", "阅览测试.txt", "纯文本预览示例\n\n这是适合说明、备忘和导出结果的文本文件。\n保持换行、空格与长行滚动。\n\n第二段内容。", "text/plain"],
    ["阅览测试 · 运行日志", "阅览测试.log", "2026-09-20 09:30:01 INFO  preview server started\n2026-09-20 09:30:02 INFO  loaded document: report.docx\n2026-09-20 09:30:02 WARN  optional asset not found: ./missing.png\n2026-09-20 09:30:03 INFO  request completed status=200 duration=42ms", "text/plain"],
    ["阅览测试 · 环境变量", "阅览测试.env", "APP_ENV=development\nAPI_BASE_URL=http://127.0.0.1:3100\nDOCUMENT_PREVIEW=true\nMAX_FILE_SIZE_MB=5\n# secrets should never be committed", "text/plain"],
    ["阅览测试 · HTML 交互", "阅览测试.html", "<!doctype html><html><head><meta charset=\"utf-8\"><title>HTML 预览测试</title><style>body{font:16px system-ui;padding:28px;color:#26352d}button{padding:8px 14px}</style></head><body><h1>HTML 真实预览</h1><p id=\"status\">脚本尚未运行</p><button id=\"toggle\">点击测试脚本交互</button><script>document.getElementById('toggle').addEventListener('click',()=>{document.getElementById('status').textContent='脚本交互正常';});</script></body></html>", "text/html"],
  ];
  for (const [title, filename, body, mime] of samples) {
    const [existing] = await query(db, "SELECT a.id FROM artifacts a JOIN versions v ON v.artifact_id=a.id WHERE a.project_id=? AND v.filename=? AND a.deleted_at IS NULL LIMIT 1", [project.id, filename]);
    if (existing) continue;
    await service.uploadOfficialDocument(actor, project.id, {
      title,
      filename,
      mime,
      contentBase64: Buffer.from(body).toString("base64"),
      note: "用于验证文档阅读器体验的测试样例。",
    });
    console.log("已添加 " + filename);
  }
} finally {
  await db.end();
}










