function utc(value) {
  if (!value) return undefined;
  const text = String(value);
  const normalized = text.replace(" ", "T");
  const date = new Date(normalized + (/Z$|[+-]\d\d:\d\d$/.test(normalized) ? "" : "Z"));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseUsage(value) {
  if (!value) return undefined;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}

/** Match both sides of a recorded turn in order; append it if the snapshot omitted it. */
export function mergeLaowengSessionTurns(history, turns) {
  const messages = history.map((message) => ({ ...message }));
  let cursor = messages.length;
  for (const turn of [...turns].reverse()) {
    const input = String(turn.input_text || "")
      .trim()
      .slice(0, 16000);
    const output = String(turn.output_text || "")
      .trim()
      .slice(0, 16000);
    let match = -1;
    let answer = -1;
    for (let index = cursor - 1; index >= 0; index--) {
      if (messages[index].role !== "user" || messages[index].text !== input) continue;
      let end = index + 1;
      while (end < messages.length && messages[end].role !== "user") end++;
      const candidate = messages
        .slice(index + 1, end)
        .findLastIndex((message) => message.role === "assistant");
      const candidateIndex = candidate < 0 ? -1 : index + 1 + candidate;
      if (!output && candidateIndex >= 0) continue;
      if (output && (candidateIndex < 0 || messages[candidateIndex].text !== output)) continue;
      match = index;
      answer = candidateIndex;
      break;
    }
    const createdAt = utc(turn.started_at);
    const finishedAt = utc(turn.finished_at);
    const usage = parseUsage(turn.usage_stats);
    if (match >= 0) {
      messages[match].createdAt = createdAt;
      if (output && answer >= 0) {
        messages[answer].createdAt = finishedAt;
        messages[answer].usage = usage;
      }
      cursor = match;
    } else {
      const inserted = [
        {
          id: `turn-${turn.id}-input`,
          role: "user",
          source: null,
          text: input,
          createdAt,
        },
      ];
      if (output)
        inserted.push({
          id: `turn-${turn.id}-output`,
          role: "assistant",
          source: null,
          text: output,
          createdAt: finishedAt,
          usage,
        });
      messages.splice(cursor, 0, ...inserted);
    }
  }
  return messages;
}
