import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";
import { executeRun } from "../server/acs.js";
const db = await createDatabase();
try {
  const [user] = await query(db, "SELECT id FROM users WHERE COALESCE(username,email)=?", [
    process.env.ADMIN_EMAIL,
  ]);
  const [thread] = await query(
    db,
    "SELECT id FROM threads WHERE created_by=? AND status='active' ORDER BY created_at LIMIT 1",
    [user.id],
  );
  const result = await executeRun(
    new Service(db),
    { ...user, kind: "session" },
    thread.id,
    {},
    "summary",
  );
  console.log({ status: result.status, outputLength: result.output.length });
  if (result.status !== "succeeded") process.exitCode = 1;
} finally {
  await db.end();
}
