/** Keep surface materials and motion in their component stylesheet. */
import fs from "node:fs";
import ts from "typescript";
const classes = JSON.parse(
  fs.readFileSync(new URL("./overlay-surface-classes.json", import.meta.url), "utf8"),
);
const cosmetic =
  /^(?:background(?:-.+)?|border(?:-.+)?|box-shadow|backdrop-filter|-webkit-backdrop-filter|animation(?:-.+)?|transition(?:-.+)?|opacity)$/;
const errors = [];
/** 待迁移：这些文件仍有手写 listbox，迁移到 SelectField 后从此表移除。 */
const legacyListbox = new Set([
  "AgentMonitor.tsx",
  "ChatComposer.tsx",
  "HtmlBrowserToolbar.tsx",
  "ThemePicker.tsx",
]);
for (const name of fs.readdirSync("web")) {
  const path = `web/${name}`;
  if (!/\.(css|tsx)$/.test(name)) continue;
  const source = fs.readFileSync(path, "utf8");
  if (name.endsWith(".css") && name !== "overlays.css") {
    if (/--overlay-[\w-]+\s*:/.test(source))
      errors.push(`${path}: 浮层视觉变量只能定义在 overlays.css`);
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const targets = match[1]
        .split(",")
        .some((selector) =>
          classes.some((cls) =>
            new RegExp(
              `(?:^|[\\s>+~])\\.${cls}(?![\\w-])(?:[.#][\\w-]+|:[\\w-]+(?:\\([^)]*\\))?)*\\s*$`,
            ).test(selector.trim()),
          ),
        );
      if (!targets) continue;
      for (const declaration of match[2].split(";")) {
        const prop = declaration.split(":")[0].trim();
        if (cosmetic.test(prop))
          errors.push(
            `${path}:${source.slice(0, match.index).split("\n").length}: ${prop} 属于公共浮层组件`,
          );
      }
    }
  }
  if (
    !name.endsWith(".tsx") ||
    [
      "dialog-fx.tsx",
      "ContextMenu.tsx",
      "FloatingPanel.tsx",
      "Tip.tsx",
      "Field.tsx",
      "SelectField.tsx",
    ].includes(name)
  )
    continue;
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      if (tag === "DialogClose") errors.push(`${path}: 标题栏请使用公共 DialogHeader`);
      if (tag === "dialog") errors.push(`${path}: 请使用公共 Dialog`);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        if (
          attr.name.text === "role" &&
          attr.initializer?.getText(ast) === '"menu"' &&
          tag !== "ContextMenu"
        )
          errors.push(`${path}: 请使用公共 ContextMenu`);
        if (
          attr.name.text === "role" &&
          attr.initializer?.getText(ast) === '"listbox"' &&
          !["SelectField", "FloatingPanel"].includes(tag) &&
          !legacyListbox.has(name)
        )
          errors.push(`${path}: 请使用公共 SelectField`);
        if (
          ["Dialog", "FloatingPanel", "ContextMenu", "SelectField"].includes(tag) &&
          attr.name.text === "style" &&
          attr.initializer
        ) {
          const text = attr.initializer.getText(ast);
          if (
            /\b(background\w*|border\w*|boxShadow|backdropFilter|opacity|animation\w*|transition\w*)\s*:/.test(
              text,
            )
          )
            errors.push(`${path}: 浮层 style 只能调整尺寸和定位`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("浮层组件边界检查通过（三类基础浮层 + ContextMenu 派生）。");
