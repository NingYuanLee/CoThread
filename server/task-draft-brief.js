/**
 * 根据已选正式文件起草任务的标题、目标和约束。
 * 同一登录人 5 秒内只能生成一次，避免连点打爆模型。
 */
import { z } from "zod/v3";
import { TASK_DRAFT_SYSTEM_PROMPT, taskDraftPromptText } from "../shared/task-draft-brief.js";
import { query } from "./db.js";
import { latestVersionsByFolderRoots } from "./documents/index.js";
import { HttpError } from "./http-error.js";
import { modelResponse, responseText } from "./model-config.js";
import { describeMouthpieceAttachment } from "./mouthpiece.js";
import { assertDocumentRefs, assertFolderRefs } from "./task-documents.js";

const GAP_MS = 5000;
const FILE_LIMIT = 12;
const MATERIAL_CHARS = 12000;
/**
 * 只交一小段 JSON。推理 token 会计入 max_output_tokens，
 * 低档推理仍要留出额度，1200 会在正文写完前被截断。
 */
const DRAFT_MAX_TOKENS = 16384;
const lastAt = new Map();

export const draftBriefSchema = z.object({
  refs: z.array(z.string().uuid()).max(30).default([]),
  folderRefs: z.array(z.string().uuid()).max(30).default([]),
  prompt: z.string().max(8000).optional().default(""),
  targetUserId: z.string().uuid().optional(),
  threadId: z.string().uuid(),
});

export function takeDraftBriefGap(userId, now = Date.now()) {
  const previous = lastAt.get(userId) || 0;
  if (now - previous < GAP_MS) {
    const wait = Math.ceil((GAP_MS - (now - previous)) / 1000);
    throw new HttpError(429, `请隔 ${wait} 秒再生成`);
  }
  lastAt.set(userId, now);
}

export function parseTaskDraftBrief(raw) {
  const text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, "没有生成出可用的任务内容，请再试一次");
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError(502, "没有生成出可用的任务内容，请再试一次");
  }
  const title = String(parsed.title || "")
    .trim()
    .slice(0, 240);
  const goal = String(parsed.goal || "")
    .trim()
    .slice(0, 20000);
  const constraints = String(parsed.constraints || "")
    .trim()
    .slice(0, 20000);
  if (!title || !goal) throw new HttpError(502, "没有生成出标题和目标，请再试一次");
  return { title, goal, constraints };
}

/** 模型没写完、超时或返回异常时，不要落成无状态的 500。 */
export function draftBriefClientError(error) {
  if (error instanceof HttpError) return error;
  return new HttpError(502, "没有生成出可用的任务内容，请再试一次");
}

/** 结构化短 JSON。保留低档推理，输出额度要盖住思考和正文。 */
export function taskDraftModelRequest(messages) {
  return {
    scope: "coordinator",
    reasoningEffort: "low",
    maxTokens: DRAFT_MAX_TOKENS,
    signal: AbortSignal.timeout(45000),
    messages,
  };
}

function materialOf(version) {
  const described = describeMouthpieceAttachment(version);
  return {
    versionId: version.id,
    title: described.name,
    text: described.kind === "text" && described.excerpt ? described.excerpt : "",
    note: described.note || "",
  };
}

function userMessage(prompt, tree, assignee) {
  return [taskDraftPromptText(prompt), assignee, tree.slice(0, MATERIAL_CHARS)]
    .filter(Boolean)
    .join("\n\n");
}

const REMARK_LIMIT = 8;
const REMARK_CHARS = 280;

function clipRemark(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= REMARK_CHARS) return text;
  return `${text.slice(0, REMARK_CHARS)}…`;
}

export const UNASSIGNED_TASK_NOTE = "当前任务暂无明确指派。";

/** 本迭代里被记成关键发言的原话。只用于认识指派对象。 */
export function formatAssigneeRemarks({ name, remarks }) {
  const who = String(name || "这位成员").trim() || "这位成员";
  const lines = [
    `这条任务指派给：${who}`,
    `下面是${who}在当前迭代的关键发言，只用来认识这个人。不要用这些发言决定任务要做什么，也不要写进任务内容。`,
  ];
  const items = (remarks || []).map(clipRemark).filter(Boolean).slice(0, REMARK_LIMIT);
  if (!items.length) {
    lines.push("本迭代还没有这个人的关键发言。");
    return lines.join("\n");
  }
  for (const item of items) lines.push(`- ${item}`);
  return lines.join("\n");
}

async function assigneeRemarks(db, projectId, threadId, userId) {
  const [member] = await query(
    db,
    `SELECT u.name FROM members m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=? AND m.user_id=? AND m.role<>'viewer'`,
    [projectId, userId],
  );
  if (!member) throw new HttpError(400, "请选择可以指派的成员");
  const rows = await query(
    db,
    `SELECT m.body FROM wiki_pages p
     JOIN wiki_page_sources s ON s.page_id=p.id AND s.source_kind='message'
     JOIN messages m ON m.id=s.source_id
     WHERE p.project_id=? AND p.subject_type='utterance' AND p.about_user_id=?
       AND p.status<>'superseded' AND m.thread_id=? AND m.body<>''
     ORDER BY m.sequence
     LIMIT ?`,
    [projectId, userId, threadId, REMARK_LIMIT],
  );
  return formatAssigneeRemarks({
    name: member.name,
    remarks: rows.map((row) => row.body),
  });
}

function folderDisplayName(folder) {
  if (!folder) return "未放入文件夹";
  if (!folder.parent_id && folder.folder_kind === "project_official") return "正式文件";
  return folder.name || folder.id;
}

/** 把已选文件夹和文件收成一棵缩进树。body 为空表示这次没有附上正文。 */
export function formatDraftTree({ folders, files, selectedFolderIds }) {
  const byId = new Map((folders || []).map((folder) => [folder.id, folder]));
  const selected = new Set(selectedFolderIds || []);
  const include = new Set();
  const addChain = (id) => {
    const seen = new Set();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      include.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
  };
  const underSelected = (id) => {
    const seen = new Set();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      if (selected.has(current.id)) return true;
      seen.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return false;
  };
  for (const folder of folders || []) {
    if (underSelected(folder.id)) addChain(folder.id);
  }
  for (const file of files || []) {
    if (file.folderId) addChain(file.folderId);
  }
  const collator = new Intl.Collator("zh-CN");
  const filesByFolder = new Map();
  const loose = [];
  for (const file of files || []) {
    if (!file.folderId || !include.has(file.folderId)) {
      loose.push(file);
      continue;
    }
    const list = filesByFolder.get(file.folderId) || [];
    list.push(file);
    filesByFolder.set(file.folderId, list);
  }
  const lines = [];
  const writeBody = (file, depth) => {
    const pad = "  ".repeat(depth);
    const body =
      file.body == null ? "（正文未附上）" : file.body || file.note || "（没有可读正文）";
    lines.push(`${pad}${file.title || "未命名文件"}`);
    for (const line of String(body).split("\n")) lines.push(`${pad}  ${line}`);
  };
  const renderFolder = (id, depth) => {
    const folder = byId.get(id);
    lines.push(`${"  ".repeat(depth)}${folderDisplayName(folder)}/`);
    const children = [...include]
      .filter((childId) => byId.get(childId)?.parent_id === id)
      .sort((a, b) =>
        collator.compare(folderDisplayName(byId.get(a)), folderDisplayName(byId.get(b))),
      );
    for (const childId of children) renderFolder(childId, depth + 1);
    const here = (filesByFolder.get(id) || []).sort((a, b) =>
      collator.compare(a.title || "", b.title || ""),
    );
    for (const file of here) writeBody(file, depth + 1);
  };
  const roots = [...include]
    .filter((id) => {
      const parentId = byId.get(id)?.parent_id;
      return !parentId || !include.has(parentId);
    })
    .sort((a, b) =>
      collator.compare(folderDisplayName(byId.get(a)), folderDisplayName(byId.get(b))),
    );
  for (const rootId of roots) renderFolder(rootId, 0);
  if (loose.length) {
    lines.push("未放入文件夹/");
    for (const file of loose.sort((a, b) => collator.compare(a.title || "", b.title || "")))
      writeBody(file, 1);
  }
  return lines.join("\n");
}

export async function generateTaskDraftBrief(db, user, projectId, input, loadVersion) {
  takeDraftBriefGap(user.id);
  const refs = await assertDocumentRefs(db, projectId, input.refs || []);
  const folderRefs = await assertFolderRefs(db, projectId, input.folderRefs || []);
  if (!refs.length && !folderRefs.length) throw new HttpError(400, "先选择正式文件，再生成");
  const assignee = input.targetUserId
    ? await assigneeRemarks(db, projectId, input.threadId, input.targetUserId)
    : UNASSIGNED_TASK_NOTE;
  const ids = [...new Set(refs)];
  const grouped = await latestVersionsByFolderRoots(db, projectId, folderRefs);
  for (const rows of grouped.values()) {
    for (const row of rows)
      if (row.version_id && !ids.includes(row.version_id)) ids.push(row.version_id);
  }
  const folders = await query(
    db,
    "SELECT id,parent_id,name,folder_kind FROM document_folders WHERE project_id=?",
    [projectId],
  );
  const meta = ids.length
    ? await query(
        db,
        `SELECT v.id,a.folder_id,a.title,v.filename FROM versions v
         JOIN artifacts a ON a.id=v.artifact_id WHERE v.id IN (${ids.map(() => "?").join(",")})`,
        ids,
      )
    : [];
  const metaById = new Map(meta.map((row) => [row.id, row]));
  const ordered = ids
    .map((id) => metaById.get(id))
    .filter(Boolean)
    .sort((a, b) =>
      String(a.title || a.filename || "").localeCompare(
        String(b.title || b.filename || ""),
        "zh-CN",
      ),
    );
  const files = [];
  let used = 0;
  let attached = 0;
  for (const row of ordered) {
    const file = {
      folderId: row.folder_id || "",
      title: row.title || row.filename || "未命名文件",
      body: null,
      note: "",
    };
    if (attached < FILE_LIMIT && used < MATERIAL_CHARS) {
      let version = null;
      try {
        version = await loadVersion(row.id);
      } catch {
        version = null;
      }
      if (version) {
        const material = materialOf(version);
        file.body = material.text;
        file.note = material.note;
        file.title = material.title || file.title;
        if (version.folder_id) file.folderId = version.folder_id;
        used += file.body.length;
        attached += 1;
      }
    }
    files.push(file);
  }
  const tree = formatDraftTree({ folders, files, selectedFolderIds: folderRefs });
  if (!tree.trim()) throw new HttpError(400, "选中的正式文件读不到内容");
  let data;
  try {
    data = await modelResponse(
      taskDraftModelRequest([
        { role: "system", content: TASK_DRAFT_SYSTEM_PROMPT },
        { role: "user", content: userMessage(input.prompt, tree, assignee) },
      ]),
    );
  } catch (error) {
    if (!(error instanceof HttpError)) {
      console.error("Task draft brief failed", {
        message: String(error?.message || error).slice(0, 300),
      });
    }
    throw draftBriefClientError(error);
  }
  return parseTaskDraftBrief(responseText(data));
}
