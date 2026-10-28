# 公共浮层组件

统一入口为 `web/overlays.ts`。三类基础浮层各自独立实现；`ContextMenu` 不是第四类基础浮层，而是 `FloatingPanel` 的派生封装，不引入独立视觉：

| 层级 | 类型           | 组件           | 规则                                                                                                                                                                   |
| ---- | -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础 | 模态弹窗       | Dialog         | 浏览器顶层、遮罩、滚动锁、Tab 焦点限制、Esc 只关闭顶层、关闭后恢复焦点、忙碌时禁止关闭                                                                                 |
| 基础 | 悬浮面板       | FloatingPanel  | 非模态玻璃面板、公共进退场、可选 Esc 关闭、焦点恢复                                                                                                                    |
| 派生 | 右键及操作菜单 | ContextMenu    | 基于 FloatingPanel：仅追加 `role="menu"`、`data-overlay="menu"` 和首项聚焦、上下方向键及 Home/End 导航；材质、动画、Esc 关闭、焦点恢复、退场快照全部来自 FloatingPanel |
| 基础 | 悬浮提示       | Tip（TipHost） | 全局提示队列、语义图标/颜色、复制、多行、延迟执行及撤销、堆叠和全部关闭                                                                                                |

菜单与面板共用同一段材质规则（`[data-overlay="panel"]` 与 `[data-overlay="menu"]` 合并选择器），仅圆角与内边距不同。因此新增菜单能力应扩展 `ContextMenu`，不得另写菜单表面。

## 视觉规则只改一处

### 按内容设置默认尺寸

公共弹窗的默认宽高及最小、最大尺寸统一在 `overlays.css` 的尺寸段维护，旧页面 CSS 不再重复定义弹窗外壳尺寸。默认高度使用 `fit-content`，避免原生 dialog 在上下定位约束下用 `auto` 拉高；只有多栏工作台、时间线、会话及图片画布保留稳定高度。正文超过上限后在原内容区滚动，标题和已有底栏不被挤出。

| 内容                         | 典型默认宽度  | 高度及约束                                       |
| ---------------------------- | ------------- | ------------------------------------------------ |
| 确认、账号小表单             | 440–520px     | 随内容；最小宽 320px，不制造空白最小高度         |
| 普通及复杂表单、信息详情     | 560–800px     | 随内容，通常最大高 760–840px；表单最小宽 360px   |
| 成员、项目、文档树及历史列表 | 640–960px     | 随数据量收缩，最大高 680–760px；列表最小宽 480px |
| 文档日志、编译发布记录       | 1120 / 1200px | 最大高 760 / 740px；最小宽 640px                 |
| 多栏面板、监控、工作台、图片 | 1040–1440px   | 使用 740–880px 稳定视区，最小高 320–440px        |

每个尺寸最终受视口限制：正常边距 24px，宽度 ≤600px 或高度 ≤500px 时边距 12px；最小尺寸也要缩至可用视口以内。项目选择默认 800px，足以显示三列 240px 卡片；不足时自动减少列数。极矮窗口的筛选区有高度上限并可单独滚动，以给列表及分页底栏留出空间。全屏独立覆盖尺寸，退出后恢复各自默认值。`AdminConfirmDialog` 使用独立紧凑尺寸，避免继承管理详情的宽度。

遮罩色当前使用 10% 不透明度（嵌套层 6%）；标题栏单独使用 66% 主题底色与 `blur(28px) saturate(180%)`，视觉比正文更厚。所有参数及无透明度/强制配色回退均定义在 `overlays.css`。

`DialogBody` 是按需使用的 20px 正文留白容器，只用于原本没有正文内边距的纯文本、简单表单及确认弹窗。主题网格、成员列表、分栏面板、表格或画布等已有自身间距的结构不再包裹。外壳及标题栏仍保持原有零外壳内边距规则。

单表单和单列表使用 `DialogFooter` 承载原有提交、确认等业务操作或完整分页行（`pagination`），不自动添加关闭/完成按钮。没有底部操作或分页的列表不制造空底栏。底栏不参与正文滚动，背景与分隔线贴合弹窗左右和底边，仅内部控件保留统一留白；不得用负 margin 抵消正文 padding。底栏与滚动正文是兄弟节点，表单提交按钮仍保留在对应 form 内。`AdminDialog` 和 `WorkspaceDialog` 也支持显式 footer 插槽；嵌套表单用 `.dialog-form-scroll` 包正文、底栏放在其外。旧的管理页分页负边距与 sticky 补偿规则已移除。

单列表弹窗不设固定高度，也不设外壳最小高度，由列表内容撑开，最多到公共视口上限。列表区统一保留 min(180px, 20dvh) 最小高度，空列表和少量数据仍有基本展示空间；达到上限后仅列表区滚动。外壳及中间布局容器使用 overflow: hidden，不能再与列表同时滚动。列表表头固定在列表顶部，筛选区和底部分页位于列表之外；项目卡片列表、成员列表、日志列表、历史表格及编译记录共用这些规则。

单列表弹窗的筛选区使用 `DialogFilters`，固定提供“查询”和“重置”。已有业务条件继续保留；缺少条件的列表至少提供关键词搜索。关键词草稿经查询或 Enter 应用，重置立即清空条件并恢复列表第一页。公共宽度为关键词 240px、普通选择/输入 160px、日期时间 210px、日期范围 260px，控件高 36px，窄屏换行。字段从左向右排，操作按钮同组靠右。筛选区与滚动列表分开，不放进列表滚动区；正文已有留白时筛选区不重复包入 `DialogBody`。成员/项目选择、文档日志、编译发布记录、管理关联/变更列表及历史记录采用此规则；多分栏工作台、详情多表和树选择器不作为单列表改造。

页面及弹窗的刷新动作使用 `RefreshButton`，与标题栏全屏和关闭共同使用 `IconButton`：30px 纯图标、透明底、统一悬停和禁用样式，保留可访问名称和悬停说明。标题栏中刷新位于全屏左侧，关闭固定最右侧。`pending` 提供旋转状态；“重置令牌”等使用相似图标的其他业务操作仍保留明确的动作文字，菜单项仍保留文字。

唯一视觉源为 `web/overlays.css`，通过基础样式 `style.css` 引入，登录页和工作台均可用。每类浮层的动画时长/曲线、边框、圆角、阴影、背景、透明度、玻璃模糊、内边距和遮罩规则由此统一维护。提示类型颜色是组件内建语义，不是业务定制样式。

业务调用只可定制尺寸和 `direction`（up/down/left/right/none）；尺寸包括 width/height/min/max。位置和层级用于锚点定位，不改变视觉材料。业务仍可提供内容、事件、关闭回调和忙碌等行为参数。不得在页面 CSS、内联 style 或新变量中覆盖公共浮层视觉。公共外观规则锁定优先级，避免导入顺序使外观分叉。

`overlay-motion.ts` 中的关闭计时读取同一 CSS 时长，修改样式后定时清理同步变化。减少动态效果时跳过动画；减少透明度、不支持模糊及强制配色时使用公共回退。

入场 240ms、退场 170ms。曲线是整段都在减速的 `cubic-bezier(0.33, 0.66, 0.2, 1)` 和一开始就移动的 `cubic-bezier(0.32, 0.48, 0.24, 1)`，并带约 1.5%–3% 的缩放。不要改回前 1/3 就走完的急减速，也不要改回起步速度为 0 的急加速，否则开关会重新变成猛弹一下或点了关闭先顿住。

普通模态框保持 `position: fixed`，不能改成 `relative`，否则会撑进文档流：打开时页面被滚向弹窗，立刻关闭又弹回。锁滚动只改 `html` 的 `overflow`，不要加 `padding-right` 或 `scrollbar-gutter`：页面经常没有滚动条，多出来的右侧空白会把背景整体往左挤。入场还没播完就关闭时，从当前帧倒放，不要改播退场动画（那会先跳回全尺寸）。

`npm run lint` / `npm run lint:boundaries` 包含 `scripts/check-overlays.mjs`：检查业务直接使用原生 dialog、手写菜单、内联视觉覆盖、页面浮层视觉规则和私设 overlay 变量。`overlay-surface-classes.json` 记录迁移的布局类，仅用于防止旧页面重写视觉；新组件通过公共属性选择器自带表面规则。

## 使用

模态弹窗外壳和主体父容器内边距统一为 0。标题栏使用公共 `DialogHeader`（从 `web/overlays.ts` 导出），不得再手写标题栏或拼装 `DialogClose`。标题栏的间距、行高、边框和图标按钮样式由 `overlays.css` 集中维护；正文需要留白时由正文容器提供，不能给整个弹窗加内边距。

左区按 `icon`、`title`/`subtitle`、`leftExtra` 排列；主副标题各一行，无图标不留占位，无副标题时主标题垂直居中。右区视觉上从右到左固定为关闭、全屏、`actions`。`onClose` 接入原公共关闭回调，`disabled` 继续执行忙碌门禁。全屏切换只影响当前弹窗，退出时恢复原尺寸，不修改文档工作区的全屏状态。`AdminDialog` 也透传这四个内容插槽。

```tsx
<Dialog onRequestClose={onClose} aria-labelledby="example-title">
  {(close) => (
    <>
      <DialogHeader
        titleId="example-title"
        title="项目文档"
        subtitle="当前项目的交付内容"
        icon={<Folder size={24} />}
        leftExtra={<span>12 份文件</span>}
        actions={<button onClick={reload}>刷新</button>}
        onClose={close}
        disabled={busy}
      />
      <div className="my-dialog-body">正文</div>
    </>
  )}
</Dialog>
```

`Dialog` 接受 `active`、`onRequestClose`、`enabled`、`closeOnBackdrop`、`closeOnEscape`，以及 children(close) 渲染回调。条件挂载可省略 active。表单必须保留真实 form 元素，再放入弹窗；onSubmit 不能绑定到 dialog 来替代表单。

`ModalBackdrop` 是兼容布局适配器，内部使用同一 Dialog；shell 只负责全屏布局，直接内容面板使用公共弹窗表面。普通页面卡片、表单字段和文档内容不套用浮层材料。

`FloatingPanel` 使用 direction、onDismiss 和布局样式；`ContextMenu` 透传这些参数并叠加菜单语义，不要绕过它手写菜单容器。现有锚点定位及边缘避让由调用者保留。需跨越裁切边界时使用基础设施 FloatingPortal，它把浮层挂入当前模态弹窗并提升到顶层。组件卸载后只读、不可交互的退场快照在公共时长结束后清除；所属弹窗关闭时不生成快照，避免闪烁。

提示默认成功 1.8 秒、警告 3 秒、信息 2.8 秒、错误手动关闭；多行默认带复制。延迟执行的撤销/关闭会取消尚未开始的指令，执行中不可假装取消。超过 6 条常驻提示时，全部关闭按钮独立位于列表上方。默认从右侧入场并向右渐隐，showTip 支持 width 和 direction。接口失败使用提示；成功返回空数组仅显示内容区空状态。

## 输入类控件外型组

原生 `input` / `select` / `textarea` 由公共外型组接管，不再直接用元素选择器兜底。四件套从 `web/overlays.ts` 导出：

| 组件            | 对应原生控件       | 说明                                                                                                                            |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `Field`         | —                  | 外型组：label 浮动、四种状态（idle / active / error / disabled）、有无内容、hint / error 文案、右侧或右下角自定义按钮区         |
| `TextField`     | `input`            | 单行文本                                                                                                                        |
| `TextAreaField` | `textarea`         | 多行文本，字数提示由 `maxLength` + `hint` 组合                                                                                  |
| `SelectField`   | `select`           | 单选下拉：自身展示触发器，选项列表在 `FloatingPanel` 内以 `listbox` 呈现；`searchable` 时触发器变为可输入控件，在浮层内实时过滤 |
| `FileField`     | `input[type=file]` | 文件字段：只读文本框展示已选文件名，右侧按钮触发系统选择框；不展示预览，用于密钥等纯文件上传                                    |
| `ImageField`    | `input[type=file]` | 图片预览上传：圆形预览 + hover 相机遮罩 + 隐藏文件输入，可选移除按钮；头像与项目封面共用                                        |

label 浮动由 JS 状态驱动而非纯 CSS，因为 `select` 无法用 `:placeholder-shown` 判断有无内容。无内容且未聚焦时 label 显示在框内充当占位；有内容、聚焦或报警时上移到输入框左上角、压住边框线、缩小并变色。

新页面必须使用上述组件，禁止直接写原生 `input` / `select` / `textarea` 表单字段。`npm run lint` 会执行 `scripts/check-field-usage.mjs`：扫描 `web/*.tsx`，非文本控件（search / checkbox / radio / file / hidden / range / color）与已在脚本 `ALLOW_FILES` 登记的紧凑工具栏、表格内联区域除外，其余原生控件会直接报错并给出行号。新增例外必须在脚本里登记并写明原因。

`SelectField` 支持 `clearable`：有选中值时在箭头左侧显示清空按钮（16px 圆形 ×，悬停加深），点击或按 Delete / Backspace 置空 `value`。它不嵌套在触发器内部（避免 button 套 button），而是绝对定位在 `.field-control` 上；开启后触发器右侧内边距自动加大到 46px（dense 42px）。仅用于「空值有明确语义」的下拉（典型是筛选条件的全部/不限）。

`SelectField` 无障碍模式为 `combobox` + `listbox` + `option`，与菜单的 `menu` / `menuitem` 严格区分，不得混用。浮层材质直接复用 `FloatingPanel`，与菜单共享同一段玻璃规则，不另建外观。键盘交互：↑↓ 移动、Home / End 跳转、Enter 或空格选中、Esc 关闭。

`scripts/check-overlays.mjs` 已把三者纳入门禁：业务不得手写 `role="listbox"`（应改用 `SelectField`），`SelectField` 的 `style` 只允许调整尺寸和定位。`AgentMonitor`、`ChatComposer`、`HtmlBrowserToolbar`、`ThemePicker` 仍是手写 listbox，暂列待迁移豁免，迁移完成后从 `legacyListbox` 移除。

### 右侧自定义按钮

`Field` 的 `action` 插槽用于「输入框外观 + 自定义按钮」组合（如用户名「修改」、邮箱「更换绑定」）：

- 容器 `.field-action` 绝对定位于 `.field-control` 内（`right: 4px; top: 50%`），**不参与父容器高度计算**；
- 按钮固定 `height: 28px`、`box-sizing: border-box`、`padding: 0 10px`，文案变长只会变宽，不会撑高控件；控件 36px 高时上下与右侧各留 4px；
- 输入框右侧预留 `padding-right: 104px`，避免文字被按钮覆盖。

因此控件高度恒为 36px，与无按钮的输入框完全一致。

### 控件间距标准

上下堆叠的输入控件统一使用 `--field-gap`（默认 12px，定义在 `field.css` 的 `:root`）。控件自身不设上下外边距，间距只由容器提供，两种布局各用一套机制：

| 容器类型                         | 提供方式                                      |
| -------------------------------- | --------------------------------------------- |
| grid / flex 堆叠容器             | `gap: var(--field-gap, 12px)`                 |
| 普通块级容器（弹窗正文、资料页） | 相邻兄弟 `margin-top: var(--field-gap, 12px)` |

已纳入标准的容器：`.profile-identity-fields`、`.task-create-fields`、`.archive-next-fields`（grid）；`.dialog-body`、`.dialog-form-scroll`、`.profile-fields`（相邻兄弟）。`PasswordField` 外层 `.password-field` 同样使用该间距。

新增页面不得再给 `.field` 单独写 `margin-top`，也不得在 grid 容器里同时叠加 `gap` 与 `margin`，否则会出现 24px 双倍间距。

## 验收

开发预览：`http://127.0.0.1:5173/tmp/overlay-preview.html`。检查浅/深色、三类基础材料与菜单派生表面、不同方向、表单提交、忙碌关闭门禁、嵌套层级、菜单键盘操作、焦点恢复、提示复制/撤销/堆叠，以及父弹窗关闭时无额外闪现。该预览使用本地虚拟数据，不代替生产业务接口验收。
