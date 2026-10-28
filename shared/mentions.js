function mentionLabels(user) {
  const seen = new Set();
  const labels = [];
  for (const value of [user && user.name, user && user.email, user && user.username]) {
    const label = value == null ? "" : String(value).trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  labels.sort((left, right) => right.length - left.length);
  return labels;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 拆出正文里的「@当前用户」。较长称呼优先，避免用户名把邮箱截断。 */
export function splitSelfMentions(text, user) {
  const source = String(text ?? "");
  const labels = mentionLabels(user);
  if (!source || !labels.length) return [{ text: source, mention: false }];
  const pattern = new RegExp(
    "(^|[^\\p{L}\\p{N}_@])(@(?:" + labels.map(escapeRegExp).join("|") + "))(?=$|[^\\p{L}\\p{N}_@])",
    "gu",
  );
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[1].length;
    const token = match[2];
    if (start > last) parts.push({ text: source.slice(last, start), mention: false });
    parts.push({ text: token, mention: true });
    last = start + token.length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), mention: false });
  return parts.length ? parts : [{ text: source, mention: false }];
}

export function mentionsUser(text, user) {
  return splitSelfMentions(text, user).some((part) => part.mention);
}
