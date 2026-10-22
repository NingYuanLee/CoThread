import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

test(
  "deployment health probe leaves the existing executor and running work untouched",
  { timeout: 60000 },
  async () => {
    const database = await testDatabase();
    const work = await mkdtemp(join(tmpdir(), "cothread-health-probe-"));
    let child;
    let lock;
    let ownLock = false;
    try {
      const user = { id: randomUUID(), kind: "session" };
      await query(
        database.db,
        "INSERT INTO users(id,email,name,password_hash,is_super_admin) VALUES(?,?,?,'unused',TRUE)",
        [user.id, `${user.id}@test.com`, "探活测试"],
      );
      const service = new Service(database.db);
      const project = await service.createProject(user, { name: "探活隔离" });
      const thread = await service.createThread(user, project.id, { title: "保持运行" });
      const runId = randomUUID();
      const previewId = randomUUID();
      await query(
        database.db,
        "INSERT INTO sandbox_runs(id,thread_id,requested_by,kind,status,input) VALUES(?,?,?,'command','running','test')",
        [runId, thread.id, user.id],
      );
      await query(
        database.db,
        "INSERT INTO miniprogram_dev_servers(id,project_id,port,status) VALUES(?,?,5199,'running')",
        [previewId, project.id],
      );
      lock = await database.db.getConnection();
      let [owner] = await query(lock, "SELECT IS_USED_LOCK('cothread-executor') holder");
      if (owner.holder == null) {
        assert.equal(
          Number(
            (await query(lock, "SELECT GET_LOCK('cothread-executor',0) acquired"))[0].acquired,
          ),
          1,
        );
        ownLock = true;
        [owner] = await query(lock, "SELECT IS_USED_LOCK('cothread-executor') holder");
      }
      const portFinder = createServer();
      await new Promise((resolve) => portFinder.listen(0, "127.0.0.1", resolve));
      const port = portFinder.address().port;
      await new Promise((resolve) => portFinder.close(resolve));
      const control = join(work, "control.mjs");
      await writeFile(
        control,
        'process.on("message", (message) => { if (message === "shutdown") process.emit("SIGTERM"); });\n',
      );
      const target = new URL(database.url);
      const env = Object.fromEntries(
        ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"]
          .filter((key) => process.env[key])
          .map((key) => [key, process.env[key]]),
      );
      Object.assign(env, {
        COTHREAD_DB_TARGET: "prod",
        DATABASE_ENDPOINT: "public",
        DATABASE_HOST_PUBLIC: `${target.host}${target.pathname}`,
        DATABASE_AUTH: `${decodeURIComponent(target.username)}:${decodeURIComponent(target.password)}`,
        PORT: String(port),
        COTHREAD_ADMIN_ANNOUNCED: "1",
      });
      child = spawn(
        process.execPath,
        [
          "--import",
          pathToFileURL(control).href,
          fileURLToPath(new URL("../server/index.js", import.meta.url)),
          "--production",
          "--health-probe",
        ],
        { cwd: work, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      const exited = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code));
      });
      const deadline = Date.now() + 30000;
      while (
        !output.includes("未启动（健康探活）") &&
        child.exitCode == null &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(output.includes("未启动（健康探活）"), output);
      const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      assert.equal(health.status, "ok");
      assert.equal(health.executor.ready, false);
      assert.equal(String(health.executor.holderConnectionId), String(owner.holder));
      const assertWorkUntouched = async () => {
        assert.equal(
          (await query(database.db, "SELECT status FROM sandbox_runs WHERE id=?", [runId]))[0]
            .status,
          "running",
        );
        assert.equal(
          (
            await query(database.db, "SELECT status FROM miniprogram_dev_servers WHERE id=?", [
              previewId,
            ])
          )[0].status,
          "running",
        );
        assert.equal(
          String((await query(lock, "SELECT IS_USED_LOCK('cothread-executor') holder"))[0].holder),
          String(owner.holder),
        );
      };
      await assertWorkUntouched();
      child.send("shutdown");
      assert.equal(
        await Promise.race([
          exited,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("probe shutdown timed out")), 10000).unref(),
          ),
        ]),
        0,
      );
      await assertWorkUntouched();
    } finally {
      if (child && child.exitCode == null) child.kill();
      if (lock) {
        if (ownLock) await query(lock, "SELECT RELEASE_LOCK('cothread-executor')");
        lock.release();
      }
      await database.close();
      assert.ok(work.startsWith(join(tmpdir(), "cothread-health-probe-")));
      await rm(work, { recursive: true, force: true });
    }
  },
);
