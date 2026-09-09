import { query } from "./db.js";
import { Service, HttpError } from "./service.js";
import { processNextReply } from "./replies.js";
import { processNextContextCompression } from "./context-compression.js";
import { executeRun } from "./acs.js";
import { drainReplies } from "./reply-dispatch.js";
import { synchronizeNextDiscussion } from "./context-sync.js";
import { processNextCoordinator } from "./coordinator.js";

export async function runMakersThread(db, user, threadId, command, operations = {}) {
  const service = new Service(db);
  await service.thread(user, threadId, true);
  const lockName = `cothread:${threadId}`;
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) return { status: "running" };
    locked = true;
    // Only the owner of this iteration lock may recover its interrupted jobs.
    // Never reset work belonging to other iterations or blindly rerun side effects.
    await query(db, `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id
      SET r.status='failed',r.error='上次运行已中断，请检查已保存产物后重试。',r.finished_at=UTC_TIMESTAMP(3)
      WHERE m.thread_id=? AND r.status='running'`, [threadId]);
    await query(db, `UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id
      SET r.execution_active=FALSE WHERE m.thread_id=? AND r.execution_active=TRUE`, [threadId]);
    await query(db, `UPDATE agent_requests q JOIN messages m ON m.id=q.message_id
      SET q.status='queued' WHERE m.thread_id=? AND q.status='running'`, [threadId]);
    await query(db, `UPDATE agent_sessions SET compact_status='failed',compact_error='上次压缩已中断，请重试。'
      WHERE thread_id=? AND compact_status='running'`, [threadId]);
    await query(db, `UPDATE sandbox_runs SET status='interrupted',output='上次运行已中断，请检查结果后重试。',finished_at=UTC_TIMESTAMP(3)
      WHERE thread_id=? AND status='running'`, [threadId]);
    if (command) return await executeRun(service, user, threadId, command);
    const reply = operations.reply || ((id) => processNextReply(db, undefined, undefined, id));
    const compress = operations.compress || ((id) => processNextContextCompression(db, undefined, id));
    const coordinate = operations.coordinate || (operations.reply ? async () => false : (id) => processNextCoordinator(db, id));
    const maintain = operations.reply ? async () => false : async (id) => {
      try { return await compress(id) || await synchronizeNextDiscussion(db, id); }
      catch (error) { console.error("Context maintenance failed", { type: error.name }); return false; }
    };
    const deadline = Date.now() + 15 * 60 * 1000;
    // Each task already has bounded model / sandbox timeouts. Leave later jobs queued.
    while (Date.now() < deadline) {
      await service.thread(user, threadId, true);
      await drainReplies(reply, threadId, deadline, coordinate, maintain);
      if (Date.now() >= deadline) break;
      if (await compress(threadId)) continue;
      return { status: "idle" };
    }
    return { status: "queued" };
  } finally {
    try {
      if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [lockName]);
    } finally { connection.release(); }
  }
}

export function validateMakersOrigin(request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : ["http://cothread.z2l.top", "https://cothread.z2l.top"];
  if (origin && !allowed.includes(origin)) throw new HttpError(403, "请求来源不受信任");
}
