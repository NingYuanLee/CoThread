const GROUP_LABEL = {
  wiki: "知识页",
  document: "项目文档",
  thread: "迭代",
  web: "公开网页",
  folder: "文件夹",
  task: "任务",
  member: "成员",
  guide: "指南",
  brief: "简报",
};

const GROUP_ORDER = [
  "wiki",
  "document",
  "thread",
  "web",
  "folder",
  "task",
  "member",
  "guide",
  "brief",
  "other",
];
const PRIMARY_GROUPS = new Set(["wiki", "document", "thread", "web", "folder"]);

const TITLE_SUFFIXES = [
  " · 公开网页",
  " · 项目文档",
  " · 迭代消息",
  " · 迭代",
  " · 任务",
  " · 成员",
  " · 公司公开指南",
  " · 公司指南",
  " · 组织指南",
  " · 参与简报",
];

export function inferCitationKind(label, pageId) {
  const text = String(label || "");
  if (text.endsWith(" · 公开网页")) return "web";
  if (text.endsWith(" · 项目文档")) return "document";
  if (text.endsWith(" · 迭代")) return "thread";
  if (text.endsWith(" · 迭代消息") || /(?:^| · )\d+条相关$/.test(text)) return "message";
  if (text.endsWith(" · 任务")) return "task";
  if (text.endsWith(" · 成员")) return "member";
  if (
    text.endsWith(" · 公司指南") ||
    text.endsWith(" · 公司公开指南") ||
    text.endsWith(" · 组织指南")
  )
    return "guide";
  if (text.endsWith(" · 参与简报")) return "brief";
  if (pageId) return "wiki";
  return "other";
}

export function citationTitle(label) {
  let text = String(label || "").trim();
  for (const suffix of TITLE_SUFFIXES) {
    if (text.endsWith(suffix)) {
      text = text.slice(0, -suffix.length).trim();
      break;
    }
  }
  return text.replace(/ · \d+条相关$/, "").trim() || String(label || "").trim();
}

export function citeGroupId(kind) {
  if (kind === "message" || kind === "thread") return "thread";
  if (!kind || kind === "other") return "";
  return kind;
}

function typeSuffix(label) {
  const text = String(label || "").trim();
  const parts = text.split(" · ");
  if (parts.length < 2) return "";
  const suffix = parts[parts.length - 1].trim();
  if (!suffix || /^d+条相关$/.test(suffix)) return "";
  return suffix;
}

function groupKey(item) {
  const kind = citeGroupId(item.kind) || citeGroupId(inferCitationKind(item.label, item.pageId));
  if (PRIMARY_GROUPS.has(kind)) return kind;
  const suffix = typeSuffix(item.label);
  if (suffix) return "suffix:" + suffix;
  if (kind && GROUP_LABEL[kind]) return kind;
  return "other";
}

export function groupCitations(items) {
  const groups = new Map();
  for (const item of items || []) {
    const id = groupKey(item);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  const extra = [...groups.keys()].filter((id) => !GROUP_ORDER.includes(id));
  return [...GROUP_ORDER.filter((id) => groups.has(id)), ...extra].map((id) => ({
    id,
    label: id === "other" ? "其他" : GROUP_LABEL[id] || String(id).replace(/^suffix:/, ""),
    items: groups.get(id),
  }));
}

function cleanUrl(value) {
  return String(value || "").replace(/[.,;:!?）】》>"']+$/g, "");
}

export function isPublicWebUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local"))
      return false;
    return true;
  } catch {
    return false;
  }
}

export function webCitationsInBody(body) {
  const text = String(body || "");
  const seen = new Set();
  const items = [];
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = linkRe.exec(text))) {
    const url = cleanUrl(match[2]);
    if (!isPublicWebUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const title = match[1].trim() || url;
    items.push({
      id: "web:" + url,
      kind: "web",
      label: title + " · 公开网页",
      title,
      target: url,
      pageId: null,
    });
  }
  const bareRe = /https?:\/\/[^\s<>)\]]+/g;
  while ((match = bareRe.exec(text))) {
    const url = cleanUrl(match[0]);
    if (!isPublicWebUrl(url) || seen.has(url)) continue;
    seen.add(url);
    items.push({
      id: "web:" + url,
      kind: "web",
      label: url + " · 公开网页",
      title: url,
      target: url,
      pageId: null,
    });
  }
  return items;
}

function insertMark(text, title, target, mark) {
  if (title && title !== target) {
    const at = text.indexOf(title);
    if (at >= 0) {
      const after = text.slice(at + title.length, at + title.length + 2);
      if (text[at - 1] === "[" && after === "](") {
        const close = text.indexOf(")", at + title.length);
        if (close > at) return text.slice(0, close + 1) + mark + text.slice(close + 1);
      }
      return text.slice(0, at + title.length) + mark + text.slice(at + title.length);
    }
  }
  const at = text.indexOf(target);
  if (at < 0) return text;
  let end = at + target.length;
  if (text[end] === ")") end += 1;
  return text.slice(0, end) + mark + text.slice(end);
}

export function annotateWebCitations(body, items) {
  let next = String(body || "");
  let number = 0;
  const missing = [];
  for (const item of items || []) {
    if (item.kind && citeGroupId(item.kind) !== "web") continue;
    const target = item.target;
    if (!target || !isPublicWebUrl(target)) continue;
    number += 1;
    const title = item.title || citationTitle(item.label || "");
    const mark = `[${number}](${target})`;
    const updated = insertMark(next, title, target, mark);
    if (updated === next) missing.push(mark);
    else next = updated;
  }
  if (missing.length) next = next.replace(/\s*$/, "") + (next.trim() ? " " : "") + missing.join("");
  return next;
}

export function webMarkNumber(items, item) {
  let number = 0;
  for (const current of items || []) {
    if (citeGroupId(current.kind) !== "web" || !current.target || !isPublicWebUrl(current.target))
      continue;
    number += 1;
    if (current === item || current.id === item.id) return number;
  }
  return 0;
}
