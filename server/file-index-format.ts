/** 文件识别的五种终态，决定「识别结果」那一行怎么写。 */
export type FileIndexStatus = "recognized" | "partial" | "unrecognized" | "pending" | "failed";

/** 渲染文件索引需要的元数据与提取结果。 */
export type FileIndexInput = {
  title?: unknown;
  filename?: unknown;
  mime?: unknown;
  path?: unknown;
  version?: unknown;
  summary?: unknown;
  extractedText?: unknown;
  status?: FileIndexStatus;
  reason?: unknown;
};

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
}: FileIndexInput = {}): string {
  const labels: Record<FileIndexStatus, string> = {
    recognized: "识别完整",
    partial: "识别部分",
    unrecognized: "暂不支持",
    pending: "等待识别",
    failed: "等待识别",
  };
  if (!Object.hasOwn(labels, status)) throw new Error("无效的文件识别状态");
  const clean = (value: unknown): string => String(value || "").trim();
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
  lines.push("", "## 识别结果", `- ${labels[status]}`);
  if (clean(reason)) lines.push(`- 说明：${clean(reason)}`);
  return lines.join("\n");
}
