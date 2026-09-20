export const name = "cothread-visual-verification";
export const inject = ["systemPrompt"];

export function apply(ctx) {
  const level = process.env.COTHREAD_PRIMARY_AGENT_LEVEL || "l3";
  const text = level === "l1"
    ? "文档整理完成后，系统会提供整理后真实文档树的截图。必须把截图作为第二重证据检查树形结构、文件归属和明显显示问题；数据库计划或结构化清单不能单独视为完成。"
    : "涉及 HTML、网页、文档预览或可视化产物时，写入或整理完成后必须调用 capture_preview_screenshot 做视觉验收。必须检查截图中的布局、内容、资源加载和明显视觉错误；命令退出码、源代码或数据库数据不能替代截图。发现问题就继续修复并重新截图。若工具返回 model_no_image_input，说明当前模型没有图片输入能力，必须明确记录已跳过，不能声称完成了视觉验收。";
  ctx.systemPrompt.section({ name: "cothread:visual-verification", order: 801, text });
}
