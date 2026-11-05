# 旧版 Office 预览派生文件

状态：实现说明，2026-11-04。工作区仍有未提交改动，以下验证针对本机实现的实现质量，不代表已发布。

## 背景与范围

WPS「在线文档」另存/导出会把 Word 97-2003 二进制 `.doc` 直接命名成 `.docx`。这类文件：

- 文件头是 OLE2（`D0 CF 11 E0`），不是 OOXML 的 ZIP；
- 内部是 `WordDocument` + `0Table` 流，正文与截图都在二进制结构里；
- 下载不完整时长度不是 512 字节整数倍，严格解析器直接判定截断。

文件索引与 `read_document` 已能按文件头提取文字（见 [文件索引设计](17-file-index-design.md)），但前端预览 `docx-preview` 只接受 OOXML。本方案在**首次预览或上传后异步转换一次**，把结果存为派生文件，预览复用现有 docx/xlsx/pptx 渲染，图片与批注都在。

不做的部分：不做实时转换、不改原文件、不改下载；转换失败只影响预览，不阻断摘要与 Agent 读取。

## 数据层

迁移 `223_version_renditions.sql` 建 `version_renditions`：

- 主键 `version_id`，一个版本至多一份派生文件；
- `kind` 为 `docx|xlsx|pptx` 中的目标格式；
- `source_sha256` 记录生成时的源内容哈希：仓库支持同一版本 ID 原位替换内容，哈希不一致即视为过期，不会用到旧派生文件；
- `status` 为 `pending|ready|failed`，`attempts` 用于自动重试上限（3 次）。

读写只在文档内核 `server/documents/renditions.ts` 中，边界检查已把 `version_renditions` 列入文档表清单。

## 触发与状态机

`GET /api/versions/:id/rendition`：

| 状态             | 响应                                  | 前端行为                                        |
| ---------------- | ------------------------------------- | ----------------------------------------------- |
| 已有可用派生文件 | `200` + OOXML 字节                    | 直接渲染 docx/xlsx/pptx                         |
| 已开始转换       | `202 {status:"pending",retryAfterMs}` | 短轮询（最多 6 次 ×1.5s），期间显示「正在转换」 |
| 不需要/不能转换  | `415 {status:"unsupported",reason}`   | 回退到原文件或下载提示                          |
| 多次失败         | `422 {status:"failed",reason}`        | 下载提示                                        |

转换在 Node 进程内后台执行，内存单飞（同一版本不会并发转两次）；跨进程/重启由 `attempts` 与 `status` 收敛，超过上限不再自动重试。

## 转换后端

`server/office-convert.js` 支持两种后端，开箱即用：

- 已安装 `@deepseek-ai/libreoffice-kit`（本仓库已是直接依赖 `^0.2.3`）时，自动解析并使用它的 `lib/cli.js`，无需任何环境变量。该包公开在 npm（MPL-2.0），Linux 上使用 WASM 引擎，**不需要系统安装 LibreOffice**；Windows/macOS 使用随包原生引擎。
- 未安装 kit 时回退系统 LibreOffice（`--headless --convert-to`），用 `COTHREAD_SOFFICE_BIN` 指定路径（默认 `soffice`）；独立 `UserInstallation` 目录避免并发冲突。
- 需要覆盖自动发现时设置 `COTHREAD_DSOFFICE_CLI` 指向任意 kit 的 `cli.js`。

其他限制：输入 ≤8 MiB、超时默认 120 秒（`COTHREAD_OFFICE_CONVERT_TIMEOUT_MS`）、产物必须是 ZIP 且包含 `word/document.xml` / `xl/workbook.xml` / `ppt/presentation.xml`，否则放弃。转换前会把长度补零到 512 字节整数倍，兼容下载不完整的文件。

## 部署

`@deepseek-ai/libreoffice-kit` 已加入 `package.json` 依赖并写入锁文件，`npm ci` 即可，无需安装系统 LibreOffice：

```sh
npm ci
npm run db:migrate
# 重启服务后生效；Linux 上 kit 自动使用 WASM 引擎
```

如已安装系统 LibreOffice 并希望优先使用，可设置 `COTHREAD_SOFFICE_BIN=/usr/bin/soffice`；但此时必须安装中文字体（`fonts-noto-cjk`），否则中文会渲染成方块。kit 的 WASM 引擎同样依赖系统字体可见性，建议一并确认。

`npm install` 会改动 `package.json` 与 `package-lock.json`；本次已在本机完成安装（kit `^0.2.3`），锁文件差异只涉及 kit 及其 koffi/嵌套去重，没有无关依赖版本漂移。发布时按 [发布文档](05-cloud-environment.md) 走正常打包。

## 验证

- 单元测试 `tests/office-convert.test.js`：只有 OLE2 需要派生、OOXML 产物校验、dsoffice 后端成功/失败、截断文件补零后交给转换器。
- 单元测试 `tests/renditions.test.js`：派生记录的查询/upsert/完成/失败 SQL 与参数；查询正文时不会误判。
- 本机用 kit CLI 作为后端转换真实样例（3.4MB、7 张截图的 WPS 文档）：约 4 秒产出 2.86MB docx，7 段正文与 7 张图片完整，内容与人工转换一致。
- 开发库集成（2026-11-04）：`npm run db:migrate` 应用 221/222/223；脚本插入临时项目与版本（真实 3.4MB WPS 文件、`.docx` 后缀）后验证：首次 `ensure` 返回 pending → 后台转换写出 `ready` 派生记录（2.86MB、`source_sha256` 一致、通过 OOXML 校验）→ 二次 `ensure` 命中缓存 → 模拟同版本原位替换内容后旧派生文件失效并重转成功 → 非 OLE2 内容判定为 `unsupported`；清理后 `version_renditions` 无残留。本次集成暴露并修复了内核模块漏导入 `query` 的问题。
- 未验证：ECS/Docker 上的 WASM 引擎（本机是 Windows 原生引擎）、预览路由的 HTTP 端到端（本次直接调用编排与内核函数）、前端 `vite build`。

## 限制

- 转换是 CPU/内存重活：单实例部署时应控制并发（当前单飞 + 超时），文件过大（>8 MiB）不转换。
- 版式以 LibreOffice 渲染为准，可能与 WPS/Word 有差异；派生文件不替代原件。
- `.ppt` 转 pptx 走同一后端，未在真实样例上验证。
