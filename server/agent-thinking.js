import { query } from "./db.js";

// Observe lifecycle only; never store reasoning text in the public event log.
export function trackThinking(db, messageId, sessionId) {
  let queue = Promise.resolve();
  let eventId;
  let active = false;
  let failure;
  const enqueue = (task) => {
    queue = queue.then(task).catch((error) => {
      failure ||= error;
    });
  };
  const finish = (status = "completed") => {
    if (!active) return;
    active = false;
    enqueue(async () => {
      if (eventId)
        await query(
          db,
          "UPDATE agent_events SET status=?,finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'",
          [status, eventId],
        );
      eventId = undefined;
    });
  };
  return {
    notify(notification) {
      if (
        notification.method !== "session.event" ||
        notification.params.sessionId !== sessionId
      )
        return;
      const type = notification.params.event?.type;
      if (type === "step/start" && !active) {
        active = true;
        enqueue(async () => {
          const result = await query(
            db,
            "INSERT INTO agent_events(message_id,tool,status,input) SELECT message_id,'thinking','running','{}' FROM assistant_replies WHERE message_id=? AND status='running'",
            [messageId],
          );
          eventId = result.affectedRows ? result.insertId : undefined;
          if (eventId)
            await query(
              db,
              "UPDATE assistant_replies SET progress='正在思考' WHERE message_id=? AND status='running'",
              [messageId],
            );
        });
      } else if (
        ["assistant/message", "tool/call", "step/end", "turn/end"].includes(
          type,
        )
      )
        finish();
    },
    async flush() {
      await queue;
      if (failure) throw failure;
    },
    async close(status) {
      finish(status);
      await queue;
      if (failure) throw failure;
    },
  };
}
