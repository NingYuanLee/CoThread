/**
 * AI嘴替：用小祥的模型帮当前用户起草一条还没发出去的话。
 * 有草稿或附件时润色；输入框是空的时，按群聊或问老翁最近的发言起草。
 * 只返回正文，不代发消息。
 */
import { z } from "zod/v3";
import { fileDisplayName, isImageFile } from "../shared/document-name.js";
import { isDocumentText, readDocumentContent } from "./documents/index.js";
import { query } from "./db.js";
import { HttpError } from "./http-error.js";
import { modelConfig, modelResponse, responseText } from "./model-config.js";

const RECENT_GROUP_LIMIT = 8;
const RECENT_ELDER_LIMIT = 6;
const MAX_ATTACHMENTS = 8;
const DRAFT_CHARS = 12000;
const ATTACHMENT_CHARS = 4000;
const ATTACHMENT_BUDGET = 8000;
const MESSAGE_CHARS = 500;
const IMAGE_BYTES = 1_200_000;
const TEXT_BYTES = 24_000;

const POLISH_SYSTEM = [
  "把发言人即将发送的话整理成他本人会发出去的原文。只润色，不替他做决定，也不要写成旁白或建议。",
  "读懂草稿和附件。附件是他要一起发出的材料：发言里要体现读到的关键内容，但不要把附件全文贴回去。",
  "保留原意、数字、承诺边界、@提及，以及以 / 开头的文件引用（例如 /方案.md）。",
  "没有依据的事实、承诺、决定不要新增。",
  "语气像他本人在说话：自然、简短、清楚。不要客套开场，不要「润色如下」，不要解释你做了什么。",
  "只输出要填进输入框的正文。不要标题、外层引号、代码围栏或 Markdown 标题。",
].join("\n");

function suggestSystem(scene, speaker, basis = "others") {
  const who = speaker || "我";
  const lines = [
    `你就是${who}。要补的是${who}自己的下一句话，不是别人给${who}的建议，也不是旁白。`,
    `用「我」时，我就是${who}。不要写「${who}可以」「建议你」「不妨」「综上所述」。`,
  ];
  if (basis === "greet") {
    lines.push(
      `这边还没有任何人说过话，也没有${who}自己的发言。下一句只要打个招呼。`,
      `短一点，像随口开口。不要编造已经发生的讨论、进度或承诺，不要评价，不要加名字前缀。`,
      "只输出这一句正文。",
    );
    if (scene === "group")
      lines.push(`这是群聊。向大家打个招呼。知道迭代名称就可以轻轻带一下，不要 @ 任何人。`);
    else
      lines.push(
        `这是${who}和老翁的单聊。向老翁打个招呼即可，不要替老翁回答，也不要假装已经问过问题。`,
      );
    return lines.join("\n");
  }
  if (basis === "self") {
    lines.push(
      `现在没有别人的新发言。根据「我刚说的」改写得更清楚，或顺着它补一句还没说完的话。`,
      `不要原样复读，不要评价，不要加名字前缀。`,
      `不要编造${who}没做过的承诺、进度或决定。`,
      "只输出这一句正文。",
    );
    if (scene === "group") lines.push(`这是群聊。下一句仍由${who}自己接着说。`);
    else
      lines.push(
        `这是${who}和老翁的单聊。老翁还没答。下一句是${who}发给老翁的，把刚说的话改清楚或补完，不要替老翁回答。`,
      );
    return lines.join("\n");
  }
  lines.push(
    `下一句的内容主要回应「别人刚说的」，优先接最后一条。`,
    `较早的发言只用来看懂上下文。${who}自己说过的话只用来学口气，不要接着自己的上一句续写，也不要回头接更早的话题。`,
    `不要评价这场对话，不要复述别人刚说的话，不要加名字前缀。`,
    `不要编造${who}没做过的承诺、进度或决定。信息不够就对着最后一条追问或确认。`,
    "只输出这一句正文。",
  );
  if (scene === "group") lines.push("这是群聊。对着刚说话的人接，不要 @ 讨论里没出现过的人。");
  else
    lines.push(
      `这是${who}和老翁的单聊。下一句是${who}发给老翁的，主要接老翁刚说的，不要替老翁回答。`,
    );
  return lines.join("\n");
}

const requestSchema = z.object({
  scene: z.enum(["group", "elder"]),
  threadId: z.string().uuid().optional(),
  text: z.string().max(20000).optional().default(""),
  versionIds: z.array(z.string().uuid()).max(30).optional().default([]),
});

export function decideMouthpieceMode({ text = "", versionCount = 0 } = {}) {
  return String(text).trim() || versionCount > 0 ? "polish" : "suggest";
}

export function parseMouthpieceText(raw, speaker = "") {
  let text = String(raw || "")
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (
    (text.startsWith("「") && text.endsWith("」")) ||
    (text.startsWith("“") && text.endsWith("”")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    text = text.slice(1, -1).trim();
  }
  const name = String(speaker || "").trim();
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^${escaped}\\s*[:：]\\s*`), "");
  }
  return text.slice(0, 20000);
}

function clip(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function bytesOf(version) {
  if (Buffer.isBuffer(version?.content)) return version.content;
  if (version?.content) return Buffer.from(version.content);
  return Buffer.alloc(0);
}

function visionMime(version) {
  const mime = String(version?.mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) return "";
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

export function describeMouthpieceAttachment(version) {
  const name = fileDisplayName(version);
  const raw = bytesOf(version);
  const declared = Number(version?.byte_size) || raw.length;
  if (isDocumentText(version?.mime, version?.filename || name)) {
    const read = readDocumentContent({ ...version, content: raw }, { limit: ATTACHMENT_CHARS });
    if (read.text && read.content) {
      return {
        name,
        kind: "text",
        excerpt: read.content,
        truncated: read.truncated || declared > raw.length,
      };
    }
  }
  const mime = visionMime(version);
  if (
    mime &&
    isImageFile(version) &&
    declared > 0 &&
    declared <= IMAGE_BYTES &&
    raw.length === declared
  ) {
    return {
      name,
      kind: "image",
      image: `data:${mime};base64,${raw.toString("base64")}`,
    };
  }
  if (mime || isImageFile(version)) {
    return { name, kind: "image", note: "图片较大或读不完整，只能看到文件名" };
  }
  return {
    name,
    kind: "binary",
    note: version?.mime ? `读不了正文，类型是 ${version.mime}` : "读不了正文，只能看到文件名",
  };
}

function personLabel(author, selfName) {
  const name = author || "成员";
  return name === selfName ? `${name}（另一位）` : name;
}

const REPLY_TARGET_LIMIT = 3;
const REPLY_BACKGROUND_LIMIT = 4;

export function formatGroupLines(messages, selfId, selfName = "我") {
  return groupSpeechRows(messages, selfId, selfName)
    .map((row) => row.line)
    .join("\n");
}

export function formatElderLines(turns, selfName = "我") {
  return elderSpeechRows(turns, selfName)
    .map((row) => row.line)
    .join("\n");
}

function groupSpeechRows(messages, selfId, selfName) {
  const rows = [];
  for (const message of messages || []) {
    const text = clip(message?.body, MESSAGE_CHARS);
    if (!text) continue;
    const self = message.source !== "assistant" && message.author_id === selfId;
    const name =
      message.source === "assistant"
        ? "小祥"
        : self
          ? selfName
          : personLabel(message.author, selfName);
    rows.push({ self, line: `${name}：${text}` });
  }
  return rows;
}

function elderSpeechRows(turns, selfName) {
  const rows = [];
  for (const turn of (turns || []).slice(-RECENT_ELDER_LIMIT)) {
    const ask = clip(turn?.body ?? turn?.question_body, MESSAGE_CHARS);
    const answer = clip(turn?.answer?.body ?? turn?.answer_body, MESSAGE_CHARS);
    if (ask) rows.push({ self: true, line: `${selfName}：${ask}` });
    if (answer) rows.push({ self: false, line: `老翁：${answer}` });
  }
  return rows;
}

/** 有别人说话时，回复以最新的他人发言为准。自己刚说的话只留在背景里。 */
export function focusLatestOthers(rows) {
  let end = (rows || []).length - 1;
  while (end >= 0 && rows[end].self) end -= 1;
  if (end < 0) return null;
  let start = end;
  while (start > 0 && !rows[start - 1].self) start -= 1;
  const burst = rows.slice(start, end + 1);
  const targetRows = burst.slice(-REPLY_TARGET_LIMIT);
  const backgroundRows = [...rows.slice(0, start), ...burst.slice(0, -targetRows.length)].slice(
    -REPLY_BACKGROUND_LIMIT,
  );
  return {
    background: backgroundRows.map((row) => row.line).join("\n"),
    target: targetRows.map((row) => row.line).join("\n"),
  };
}

/** 没有别人的新发言时，改写或续写自己最近说过的话。 */
export function focusReply(rows) {
  const others = focusLatestOthers(rows);
  if (others) return { basis: "others", ...others };
  const own = (rows || []).filter((row) => row.self && row.line);
  if (!own.length) return null;
  const targetRows = own.slice(-REPLY_TARGET_LIMIT);
  const backgroundRows = own.slice(0, -targetRows.length).slice(-REPLY_BACKGROUND_LIMIT);
  return {
    basis: "self",
    background: backgroundRows.map((row) => row.line).join("\n"),
    target: targetRows.map((row) => row.line).join("\n"),
  };
}

export function formatReplyFocus(focus) {
  if (!focus?.target) return "";
  const parts = [];
  if (focus.basis === "self") {
    if (focus.background) parts.push(`我较早说过的（只作背景）：\n${focus.background}`);
    parts.push(`我刚说的（在此基础上改写或续写，不要原样重复）：\n${focus.target}`);
    return parts.join("\n\n");
  }
  if (focus.background) {
    parts.push(`较早的发言（只作背景，不要当成要回复的内容）：\n${focus.background}`);
  }
  parts.push(`别人刚说的（主要回应这里，优先接最后一条）：\n${focus.target}`);
  return parts.join("\n\n");
}

function attachmentLines(items, images) {
  if (!items.length) return "附件：无";
  const seen = new Set(images || []);
  return [
    "附件：",
    ...items.map((item, index) => {
      if (item.kind === "text") {
        const note = item.truncated ? "（正文已截断）" : "";
        return `${index + 1}. ${item.name}${note}\n${item.excerpt}`;
      }
      if (item.kind === "image" && item.image && seen.has(item.image)) {
        return `${index + 1}. ${item.name}（图片，见附图）`;
      }
      return `${index + 1}. ${item.name}（${item.note || "只能看到文件名"}）`;
    }),
  ].join("\n");
}

export function buildMouthpieceInput({
  scene,
  mode,
  speaker,
  title,
  draft,
  attachments = [],
  recent = "",
  replyBasis = "others",
  includeImages = true,
}) {
  const images = includeImages
    ? attachments
        .filter((item) => item.image)
        .slice(0, 3)
        .map((item) => item.image)
    : [];
  const sceneLabel = scene === "group" ? `群聊「${title || "当前迭代"}」` : "和老翁的单聊";
  const who = speaker || "我";
  const materials = attachmentLines(attachments, images);
  const greeting =
    scene === "group"
      ? `还没有人说过话。${title ? `迭代：${title}\n` : ""}打个招呼。\n\n${who}：`
      : `还没有人说过话。向老翁打个招呼。\n\n${who}：`;
  const body =
    mode === "polish"
      ? `场景：${sceneLabel}\n发言人：${who}\n这是${who}自己要发出的草稿，改成${who}会打出去的原话。\n\n草稿：\n${draft || `（没有文字。用${who}的口气说一句，把附件说清楚）`}\n\n${materials}`
      : replyBasis === "greet"
        ? greeting
        : `${recent}\n\n${who}：`;
  const system = mode === "polish" ? POLISH_SYSTEM : suggestSystem(scene, who, replyBasis);
  const content = images.length
    ? [
        { type: "input_text", text: body },
        ...images.map((image) => ({ type: "input_image", image_url: image })),
      ]
    : body;
  return [
    { role: "system", content: system },
    { role: "user", content },
  ];
}

async function loadAttachment(service, user, projectId, versionId) {
  const meta = await service.version(user, versionId, { includeContent: false });
  if (meta.project_id !== projectId) throw new HttpError(403, "附件不属于当前项目");
  const declared = Number(meta.byte_size) || 0;
  const mime = visionMime(meta);
  let loaded = meta;
  if (mime && declared > 0 && declared <= IMAGE_BYTES)
    loaded = await service.version(user, versionId);
  else if (isDocumentText(meta.mime, meta.filename))
    loaded = await service.version(user, versionId, { maxBytes: TEXT_BYTES });
  return describeMouthpieceAttachment({
    ...meta,
    ...loaded,
    byte_size: declared || loaded.byte_size,
  });
}

function presentReply(rows) {
  const focus = focusReply(rows);
  if (!focus) return { text: "", basis: "" };
  return { text: formatReplyFocus(focus), basis: focus.basis };
}

async function loadRecentGroup(service, user, threadId, selfName) {
  const page = await service.listMessages(user, threadId, { limit: RECENT_GROUP_LIMIT });
  return presentReply(groupSpeechRows(page?.messages, user.id, selfName));
}

async function loadRecentElder(service, user, projectId, selfName) {
  // 单测可注入最近单聊。线上 Service 没有这个方法，走下面的查询。
  if (typeof service.listElderTurns === "function") {
    return presentReply(elderSpeechRows(await service.listElderTurns(user, projectId), selfName));
  }
  const rows = await query(
    service.db,
    `SELECT q.body question_body, a.body answer_body
     FROM wiki_questions q
     LEFT JOIN wiki_answers a ON a.question_id=q.id
     WHERE q.user_id=? AND q.project_id=? AND q.org_id IS NULL
     ORDER BY q.created_at DESC, q.id DESC
     LIMIT ?`,
    [user.id, projectId, RECENT_ELDER_LIMIT],
  );
  return presentReply(elderSpeechRows([...rows].reverse(), selfName));
}

async function askMouthpiece(messages, request, speaker) {
  const data = await modelResponse(
    {
      messages,
      maxTokens: 800,
      scope: "coordinator",
      reasoningEffort: "none",
      signal: AbortSignal.timeout(25000),
      config: modelConfig("coordinator"),
    },
    request,
  );
  return parseMouthpieceText(responseText(data), speaker);
}

export async function draftMouthpiece(service, user, projectId, input, request = fetch) {
  const project = z.string().uuid().safeParse(projectId);
  const parsed = requestSchema.safeParse(input ?? {});
  if (!project.success || !parsed.success) throw new HttpError(400, "AI嘴替的请求不完整");
  await service.member(user, project.data, false);
  const { scene, text } = parsed.data;
  const versionIds = [...new Set(parsed.data.versionIds)];
  if (scene === "group" && !parsed.data.threadId)
    throw new HttpError(400, "请先打开一个迭代再使用 AI嘴替");

  let thread = null;
  if (scene === "group") {
    thread = await service.thread(user, parsed.data.threadId);
    if (thread.project_id !== project.data) throw new HttpError(403, "迭代不属于当前项目");
  }

  const mode = decideMouthpieceMode({ text, versionCount: versionIds.length });
  const speaker = String(user?.name || "我").slice(0, 80);
  let truncated = false;
  let draft = text.trim();
  if (draft.length > DRAFT_CHARS) {
    draft = `${draft.slice(0, DRAFT_CHARS)}…`;
    truncated = true;
  }

  const attachments = [];
  if (mode === "polish" && versionIds.length) {
    const selected = versionIds.slice(0, MAX_ATTACHMENTS);
    if (versionIds.length > selected.length) truncated = true;
    let budget = ATTACHMENT_BUDGET;
    for (const versionId of selected) {
      const item = await loadAttachment(service, user, project.data, versionId);
      if (item.kind === "text") {
        if (budget <= 0) {
          truncated = true;
          attachments.push({ name: item.name, kind: "binary", note: "附件太多，正文没有展开" });
          continue;
        }
        if (item.excerpt.length > budget) {
          item.excerpt = `${item.excerpt.slice(0, budget)}…`;
          item.truncated = true;
          truncated = true;
          budget = 0;
        } else budget -= item.excerpt.length;
        if (item.truncated) truncated = true;
      }
      attachments.push(item);
    }
  }

  let recent = "";
  let replyBasis = "others";
  if (mode === "suggest") {
    const loaded =
      scene === "group"
        ? await loadRecentGroup(service, user, parsed.data.threadId, speaker)
        : await loadRecentElder(service, user, project.data, speaker);
    recent = loaded.text;
    replyBasis = recent.trim() ? loaded.basis || "others" : "greet";
  }

  const base = {
    scene,
    mode,
    speaker,
    title: thread?.title || "",
    draft,
    attachments,
    recent,
    replyBasis,
  };
  let spoken = "";
  const images = attachments.some((item) => item.image);
  try {
    try {
      spoken = await askMouthpiece(
        buildMouthpieceInput({ ...base, includeImages: true }),
        request,
        speaker,
      );
    } catch (error) {
      if (!images || error instanceof HttpError) throw error;
      spoken = await askMouthpiece(
        buildMouthpieceInput({ ...base, includeImages: false }),
        request,
        speaker,
      );
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = String(error?.message || error);
    if (/not configured|Model is not configured/i.test(message))
      throw new HttpError(503, "小祥的模型还没配好，暂时不能润色");
    console.error("Mouthpiece draft failed", {
      type: error?.name || "Error",
      message: message.slice(0, 300),
    });
    throw new HttpError(502, "小祥这次没有组织好语言，请再试一次");
  }
  if (!spoken) throw new HttpError(502, "小祥这次没有写出可以发送的话，请再试一次");
  return { text: spoken, mode, truncated, ...(mode === "suggest" ? { basis: replyBasis } : {}) };
}
