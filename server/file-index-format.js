/** Render only verified metadata and explicitly supplied extraction results. */
export function renderFileIndex({
  title,
  filename,
  mime,
  path,
  version,
  summary,
  extractedText,
  status = "unrecognized",
  reason,
} = {}) {
  const labels = {
    recognized: "已识别",
    partial: "部分识别",
    unrecognized: "未识别",
    failed: "处理失败",
  };
  if (!Object.hasOwn(labels, status)) throw new Error("无效的文件识别状态");
  const clean = (value) => String(value || "").trim();
  const lines = [
    "## 文件信息",
    `- 文件：${clean(filename) || clean(title) || "未命名"}`,
    `- 类型：${clean(mime) || "未知"}`,
    `- 位置：${clean(path) || "未知"}`,
    `- 版本：${version == null ? "未知" : String(version)}`,
    "",
    "## 这是什么",
    clean(summary) || "- 暂无内容说明",
  ];
  if (clean(extractedText)) lines.push("", "## 识别文字（需核对原文件）", clean(extractedText));
  lines.push("", "## 识别状态", `- ${labels[status]}`);
  if (clean(reason)) lines.push(`- 说明：${clean(reason)}`);
  return lines.join("\n");
}
