/**
 * 文档内核（documents kernel）—— 项目资料库的唯一读写入口。
 *
 * 边界约定（由 scripts/check-boundaries.mjs 强制）：
 * 1. 只有本目录下的代码可以 INSERT/UPDATE `artifacts`、`versions`、`document_folders`、
 *    `version_recycle`、`file_uploads`、`document_change_logs`、`document_change_snapshots`。
 * 2. 本目录不得 import 业务模块（`service.js`、`agent*.js`、`coordinator*.js`、`dsh-*`、`runtime/**`）。
 *    需要协作时由调用方把 `service` 作为参数传进来，而不是反向 import。
 * 3. `server/` 下其余代码只能从本文件导入（`from "./documents/index.js"`），不得深引用内部文件。
 *
 * 能力分组：
 * - 树与查询：PROJECT_LIBRARY_ROOT_KINDS / MINIPROGRAM_FIXED_FOLDERS / filter* / latestVersionsByFolderRoots / listDocumentScope
 * - 写入口：libraryChange / emptyLibraryRecycle / ensureProjectLibraryRoots（唯一写入者）
 * - 字节与上传：startFileUpload / putFileUploadChunk / completeFileUpload / decodeUploadedBytes / verifyBytes
 * - 预览与审计：previewContentType / resolveStoredMime / asPreviewHtml / recordDocumentChange / listDocumentChanges
 * - 工具面：documentTool / documentToolSchemas
 */
export * from "./library.js";
export * from "./project-library.js";
export * from "./document-tools.js";
export * from "./document-audit.js";
export * from "./file-upload.js";
export * from "./file-bytes.js";
export * from "./service-preview.js";
export * from "./preview-mime.js";
