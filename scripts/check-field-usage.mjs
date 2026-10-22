#!/usr/bin/env node
/**
 * 输入控件门禁：页面里新增原生 input / select / textarea 表单字段时报错。
 *
 * 目标是防止已经迁移到 Field 体系的页面回退。允许的例外：
 * - 非文本控件：search / checkbox / radio / file / hidden / range / color
 * - 组件自身实现：Field、TextField、TextAreaField、SelectField、FileField、ImageField
 * - 已知的紧凑工具栏 / 表格内联 / 富交互区域（下方 ALLOW_FILES 列出，附原因）
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEB_DIR = "web";

/** 组件自身实现，必然包含原生控件。 */
const COMPONENT_FILES = new Set([
  "Field.tsx",
  "TextField.tsx",
  "TextAreaField.tsx",
  "SelectField.tsx",
  "FileField.tsx",
  "ImageField.tsx",
]);

/** 允许保留原生控件的文件，附原因。 */
const ALLOW_FILES = new Map([
  ["ChatComposer.tsx", "composer 富交互输入，非普通表单字段"],
  ["HtmlPreviewFrame.tsx", "22px 预览控制条"],
  ["MiniProgramDeviceShell.tsx", "22px 设备预览控制条"],
  ["MiniprogramDatabasePanel.tsx", "23px 无边框地址栏"],
  ["DocumentVersionHistorySelect.tsx", "9rem 底栏紧凑选择器"],
  ["PaginationControl.tsx", "分页控件"],
  ["ThreadArchiveDialog.tsx", "归档决策表格内联控件"],
  ["ProjectMiniProgramConfig.tsx", "标题行环境切换"],
]);

/** 这些行内属性说明它不是文本表单字段。 */
const ALLOWED_TYPES = [
  "search",
  "checkbox",
  "radio",
  "file",
  "hidden",
  "range",
  "color",
  "submit",
  "button",
];

/** 判定：该行附近的上下文是否表明这是搜索框 / 紧凑工具控件。 */
const CONTEXT_HINTS = [/search/i, /筛选/, /pcc-/, /toolbar/i, /filter/i];

const files = readdirSync(WEB_DIR).filter((name) => name.endsWith(".tsx"));
const violations = [];

for (const file of files) {
  if (COMPONENT_FILES.has(file) || ALLOW_FILES.has(file)) continue;
  const lines = readFileSync(join(WEB_DIR, file), "utf8").split("\n");
  lines.forEach((line, index) => {
    const match = line.match(/<(input|select|textarea)\b/);
    if (!match) return;
    const tag = match[1];
    /* 收拢标签附近的上下文用于判定。 */
    const context = lines.slice(Math.max(0, index - 3), index + 4).join(" ");
    if (tag === "input") {
      const typeMatch = line.match(/type="([^"]+)"/) || context.match(/type="([^"]+)"/);
      const type = typeMatch?.[1];
      if (type && ALLOWED_TYPES.includes(type)) return;
      /* 跨行写法的 type 属性，检查下一行。 */
      const nextLine = lines[index + 1] || "";
      const nextType = nextLine.match(/type="([^"]+)"/)?.[1];
      if (nextType && ALLOWED_TYPES.includes(nextType)) return;
      /* 动态 type（type={...}）通常是复选/单选，结合上下文判定。 */
      if (/type=\{/.test(line) || /type=\{/.test(nextLine)) {
        if (/check|radio|switch|toggle/i.test(context)) return;
      }
    }
    if (CONTEXT_HINTS.some((hint) => hint.test(context))) return;
    violations.push({ file, line: index + 1, tag, code: line.trim().slice(0, 80) });
  });
}

if (violations.length) {
  console.error("输入控件门禁未通过：以下位置仍使用原生表单控件，请改用 Field 体系。");
  for (const v of violations) {
    console.error(`  web/${v.file}:${v.line} <${v.tag}> ${v.code}`);
  }
  console.error(
    `\n共 ${violations.length} 处。若确属紧凑工具栏 / 表格内联等例外，请在 ALLOW_FILES 中登记并写明原因。`,
  );
  process.exit(1);
}

console.log("输入控件门禁通过：页面未发现未登记的原生表单控件。");
