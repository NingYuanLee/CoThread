const join = (rows, pick) => (rows || []).map(pick).join("\n");

export function threadPollKey(thread) {
  if (!thread) return "";
  const usage = thread.contextUsage;
  return [
    thread.id || "",
    thread.status || "",
    thread.title || "",
    thread.background || "",
    thread.goal || "",
    thread.created_by || "",
    JSON.stringify(thread.archive_snapshot || null),
    thread.last_read_sequence || "",
    join(thread.messages, (message) =>
      [
        message.id,
        message.sequence,
        message.delivery_status,
        message.delivery_error,
        message.body,
        (message.refs || []).join(","),
        (message.folder_refs || []).join(","),
        (message.quotes || []).map((quote) => quote.id).join(","),
      ].join("\t"),
    ),
    join(thread.replies, (reply) =>
      [
        reply.message_id,
        reply.status,
        reply.progress,
        reply.error,
        reply.reply_id,
        reply.finished_at,
        reply.dispatch_ready,
        reply.participation,
      ].join("\t"),
    ),
    join(thread.requests, (request) =>
      [request.message_id, request.status, request.error].join("\t"),
    ),
    join(thread.events, (event) =>
      [event.id, event.status, event.tool, event.finished_at, event.input].join("\t"),
    ),
    join(thread.runs, (run) => [run.id, run.status, run.progress, run.output].join("\t")),
    join(thread.updates, (update) => [update.message_id, update.delivered_at].join("\t")),
    join(thread.reviews, (review) => [review.id, review.decision, review.version_id].join("\t")),
    join(thread.connectorTasks, (task) =>
      [task.id, task.status, task.progress, task.error].join("\t"),
    ),
    usage
      ? [
          usage.used,
          usage.limit,
          usage.compactStatus,
          usage.automaticCompacting,
          usage.compactError,
          (usage.categories || []).map((category) => category.tokens).join(","),
        ].join("\t")
      : "",
    thread.page ? [thread.page.hasMore, thread.page.before, thread.page.after].join("\t") : "",
  ].join("\n");
}

export function projectActivityKey(detail) {
  if (!detail) return "";
  return [
    detail.id || "",
    detail.name || "",
    detail.longTermSummary?.updatedAt || "",
    detail.libraryRevision || "",
    join(detail.threads, (thread) =>
      [
        thread.id,
        thread.title,
        thread.status,
        thread.background || "",
        thread.goal || "",
        thread.created_by || "",
        thread.last_active_at,
        thread.creator,
        thread.unread_count || 0,
        thread.unread_mention || false,
        thread.last_read_sequence || "",
      ].join("\t"),
    ),
    join(detail.members, (member) =>
      [
        member.id,
        member.role,
        member.name,
        member.motto,
        member.avatar,
        member.connector?.online,
        member.connector?.bound,
        member.connector?.lastSeenAt,
      ].join("\t"),
    ),
  ].join("\n");
}

export function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
