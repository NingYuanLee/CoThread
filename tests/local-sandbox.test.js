import assert from "node:assert/strict";
import test from "node:test";
import { LocalSandbox } from "../server/local-sandbox.js";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { executeRun } from "../server/acs.js";
import { randomUUID } from "node:crypto";

test("local runner scopes files and scrubs service credentials", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "mysql://secret@example.invalid/private";
  const sandbox = await LocalSandbox.create();
  try {
    const root = "/home/user/cothread/test";
    await sandbox.files.makeDir(root);
    await sandbox.files.write(`${root}/input.txt`, "local data");
    assert.equal((await sandbox.readFile(`${root}/input.txt`)).toString(), "local data");
    const result = await sandbox.commands.run(
      "printf '%s' \"$DATABASE_URL\"; printf 'done' > output.txt",
      { cwd: root },
    );
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal((await sandbox.readFile(`${root}/output.txt`)).toString(), "done");
    assert.throws(() => sandbox.virtualPath("/home/user/../../outside"), /越出/);
  } finally {
    await sandbox.kill();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("default run route uses the local runner when enabled", async () => {
  const database = await testDatabase();
  const previous = process.env.LOCAL_SANDBOX_ENABLED;
  process.env.LOCAL_SANDBOX_ENABLED = "true";
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(database.db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id, `${user.id}@example.com`, "本机执行验证",
    ]);
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "本机执行" });
    const thread = await service.createThread(user, project.id, { title: "命令" });
    const result = await executeRun(service, user, thread.id, { command: "printf local-route-ok" });
    assert.equal(result.status, "succeeded", result.output);
    assert.equal(result.output, "local-route-ok");
  } finally {
    if (previous === undefined) delete process.env.LOCAL_SANDBOX_ENABLED;
    else process.env.LOCAL_SANDBOX_ENABLED = previous;
    await database.close();
  }
});
