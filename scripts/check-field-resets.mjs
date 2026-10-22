/**
 * 检查 field.css 的控件是否完整重置了 style.css 的全局规则。
 * 背景：style.css 用裸元素选择器（label / input / textarea / select）定义样式，
 * 自定义控件若不显式重置，会继承 margin、font-size、padding、border 等导致错位。
 */
import fs from "node:fs";

const fieldCss = fs.readFileSync("web/field.css", "utf8");
const baseCss = fs.readFileSync("web/style.css", "utf8");

const errors = [];

/** 去掉注释，避免注释里的文字干扰属性匹配。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 取出选择器列表里精确包含某一项（按逗号拆分后完全相等）的规则块正文。 */
function blockFor(css, selector) {
  const clean = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  let result = null;
  while ((match = re.exec(clean))) {
    const parts = match[1].split(",").map((item) => item.replace(/\s+/g, " ").trim());
    // 取最后一个匹配：后声明的规则更具体，符合 CSS 层叠顺序。
    if (parts.includes(selector)) result = match[2];
  }
  return result;
}

/** 取出选择器列表里包含某一项的规则块（用于多选择器公共规则）。 */
function blockContaining(css, selectorPart) {
  const clean = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) {
    const selector = match[1].replace(/\s+/g, " ").trim();
    if (selector.includes(selectorPart)) return match[2];
  }
  return null;
}

const has = (block, prop) => new RegExp(`(?:^|[\\s;])${prop}\\s*:`).test(block);

// 1. label 必须重置全局 label 的 margin / display / font-size / line-height
const labelBlock = blockFor(fieldCss, ".field .field-label");
if (!labelBlock) {
  errors.push("field.css 缺少 .field-label 规则");
} else {
  for (const prop of ["margin", "display", "font-size", "line-height"]) {
    if (!has(labelBlock, prop))
      errors.push(`.field-label 未重置 ${prop}（会继承 style.css 的 label 规则）`);
  }
  if (!/margin\s*:\s*0/.test(labelBlock))
    errors.push(".field-label 的 margin 必须为 0，否则绝对定位被下推");
}

// 1b. label 选择器必须提高特异性：style.css 的裸 label 规则在其后加载，
//     同特异性下后者胜出，会把 display:block / margin 覆盖回来。
const labelSelectors = [];
{
  const clean = stripComments(fieldCss);
  const re = /([^{}]+)\{/g;
  let match;
  while ((match = re.exec(clean))) {
    const selector = match[1].replace(/\s+/g, " ").trim();
    if (/(^|[\s,>+~])\.field-label(?![\w-])/.test(selector)) labelSelectors.push(selector);
  }
}
if (!labelSelectors.length) {
  errors.push("未找到 .field-label 选择器");
} else {
  for (const selector of labelSelectors) {
    for (const part of selector.split(",")) {
      const one = part.trim();
      if (!one.includes(".field-label")) continue;
      // 主规则必须带 .field 前缀形成 0,2,0 特异性
      if (one === ".field-label")
        errors.push(
          ".field-label 不能作为单类选择器（会被后加载的裸 label 规则覆盖），请写成 .field .field-label",
        );
    }
  }
}

// 2. 控件必须显式重置全局 input/textarea/select 的关键属性
const controlBlock = blockContaining(fieldCss, ".field .field-control .field-input");
if (!controlBlock) {
  errors.push("field.css 缺少控件公共规则");
} else {
  for (const prop of [
    "box-sizing",
    "width",
    "border",
    "padding",
    "background",
    "font",
    "line-height",
    "box-shadow",
    "appearance",
  ]) {
    if (!has(controlBlock, prop)) errors.push(`控件公共规则未显式声明 ${prop}`);
  }
}

// 3. textarea 必须重置 resize / min-height / line-height
const taBlock = blockFor(fieldCss, ".field .field-control .field-textarea");
if (!taBlock) {
  errors.push("field.css 缺少 .field-textarea 规则");
} else {
  for (const prop of ["resize", "min-height", "line-height"]) {
    if (!has(taBlock, prop)) errors.push(`.field-textarea 未重置 ${prop}`);
  }
}

// 4. 确认 style.css 里确实存在这些全局规则；若被删除，本检查的假设失效，应提示复核
for (const selector of ["label", "input, textarea, select", "textarea"]) {
  if (!blockContaining(baseCss, selector))
    errors.push(`style.css 中未找到「${selector}」全局规则，请复核本检查是否仍必要`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("输入控件重置检查通过：Field 已覆盖全局 label / input / textarea / select 规则。");
