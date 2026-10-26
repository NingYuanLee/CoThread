# 主题系统

界面主题色的唯一真源是 `web/theme-palette.css`，其余产物均由脚本生成。手工编辑生成文件会在下次生成时被覆盖，历史上因"改调色板却没重新生成"导致过所有边框与背景色消失的故障。

## 文件分层

| 文件                         | 是否生成 | 作用                                                                       |
| ---------------------------- | -------- | -------------------------------------------------------------------------- |
| `web/theme-palette.css`      | 否       | 572 个基准色（forest 配色），所有主题的色相来源                            |
| `web/theme.css`              | 是       | 6 个主题 × 572 个 `--c-*` token                                            |
| `web/theme-overrides.css`    | 否       | 深色主题微调层：表面阶梯、边框提亮、文字提亮、状态语义色、强调色、危险按钮 |
| `web/theme-fallback-map.css` | 是       | 为只在 `var(--c-xxx, 字面量)` 回退位出现、从未定义的 token 生成深色等效值  |

`web/main.tsx` 的引入顺序固定为 `theme.css` → `style.css` → `theme-overrides.css` → `theme-fallback-map.css`，保证覆盖层晚于基础样式生效。

## 改主题的流程

1. 调基础配色：改 `web/theme-palette.css` → `npm run theme`
2. 调深色表现：直接改 `web/theme-overrides.css`（不会被生成覆盖）
3. 业务 CSS 新增了回退 token：`npm run theme:fallback`

## 主题清单

`shared/ui-theme.js` 的 `UI_THEMES` 与 `scripts/generate-ui-themes.mjs` 的 `recipes` 必须一致，否则选择器里会出现点了没效果的主题：

forest（松风）、tech（靛蓝）、dusk（暮紫）、sand（暖沙）、ink（墨玉，深色）、night（暗夜黑，深色）。

## 门禁

`npm run lint` 末尾的 `scripts/check-theme-generated.mjs` 会把 `theme.css` 与 `theme-fallback-map.css` 重新生成到临时文件并逐字节比对，不一致直接报错并提示应运行的命令。生成器支持 `THEME_OUT` / `THEME_FALLBACK_OUT` 环境变量覆盖输出路径，校验过程不会改动仓库文件。

## 深色主题的特殊约定

- 边框统一用 `color-mix(in srgb, var(--c-27362f) <百分比>, transparent)`，跟随正文色自动保持对比，不再写死颜色
- 状态语义色（成功绿 / 等待金 / 失败红）不参与中性化，见 `web/theme-overrides.css` 第 4 节
- night 的强调色是蓝色（发送按钮、开关打开态），ink 保留绿色
- 深色主题（墨玉、暗夜）的 logo 方块统一用 `#2563eb`，描边保持浅色；不改 `--c-395d40`，那个 token 同时给文字用
- 强调色按钮一律白字 + 透明描边，避免深色下出现"浅底白字"
- 「问老翁」按钮 `.ask-elder` 深色下用蓝色胶囊：蓝底 18%、蓝描边 45%、字 `#8ab4f8`，分栏打开时蓝底加深到 36%，见 `theme-overrides.css` 第 8 节。它引用的底色 / 文字 / 描边 token 在深色主题里没有定义，不显式覆盖会回落到浅色值（深绿字压近黑底）；同时要把 `--stroke` 置透明，否则全局 `button::after` 的 0.5px 发丝线会压在蓝边上
