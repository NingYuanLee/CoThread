import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../server/http-app.js";
import { EXECUTOR_LOCK_NAME, executorStatus, startReplyWorker } from "../server/replies.js";

test("health 报告执行器锁归属，worker 启停同步本实例状态", async () => {
  const database = await testDatabase();
  const db = database.db;
  const http = createApp(db).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => http.once("listening", resolve));
    const base = `http://127.0.0.1:${http.address().port}`;

    const idle = await (await fetch(`${base}/api/health`)).json();
    assert.equal(idle.status, "ok");
    assert.equal(idle.executor.lockName, EXECUTOR_LOCK_NAME);
    // 本进程没有启动工人，所以本实例一定未持锁。
    assert.equal(idle.executor.localActive, false);
    assert.equal(idle.executor.ready, false);
    assert.equal(idle.executor.localConnectionId, null);
    assert.equal(idle.executor.acquiredAt, null);
    // 锁可能被同一 MySQL 实例上的开发服务器持有，因此只断言类型。
    assert.ok(
      idle.executor.holderConnectionId === null ||
        typeof idle.executor.holderConnectionId === "number",
    );

    // MySQL 的 GET_LOCK 是实例级的，这里用独立锁名避免与开发服务器/其它测试争用。
    const lockName = `cothread-executor-health-${randomUUID()}`;
    const stop = await startReplyWorker(db, db, { lockName, lockWatchMs: 5000 });
    const running = executorStatus();
    assert.equal(running.active, true);
    assert.equal(running.lockName, lockName);
    assert.equal(typeof running.connectionId, "number");
    assert.ok(running.acquiredAt);

    const busy = await (await fetch(`${base}/api/health`)).json();
    assert.equal(busy.executor.localActive, true);
    assert.equal(busy.executor.localLockName, lockName);
    assert.equal(busy.executor.localConnectionId, running.connectionId);
    assert.equal(busy.status, "ok");
    assert.equal(busy.executor.ready, true);
    const work = await (await fetch(`${base}/api/health/work`)).json();
    assert.equal(typeof work.queued, "number");
    assert.equal(typeof work.running, "number");

    await stop();
    const stopped = executorStatus();
    assert.equal(stopped.active, false);
    assert.equal(stopped.connectionId, null);

    const released = await (await fetch(`${base}/api/health`)).json();
    assert.equal(released.executor.localActive, false);
    assert.equal(released.executor.ready, false);
  } finally {
    await new Promise((resolve) => http.close(resolve));
    await database.close();
  }
});

test("锁信息读取失败时健康检查仍报告 ok，并标注 lockError", async () => {
  const database = await testDatabase();
  const db = database.db;
  // 锁信息是附加项：读取失败不应该把一个实际健康的实例报成不健康。
  const http = createApp(db, {
    readExecutorHolder: async () => {
      throw new Error("锁信息暂不可用");
    },
  }).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => http.once("listening", resolve));
    const base = `http://127.0.0.1:${http.address().port}`;
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.status, "ok");
    assert.equal(health.database, "mysql");
    assert.equal(health.executor.holderConnectionId, null);
    assert.match(health.executor.lockError, /锁信息暂不可用/);
    assert.equal(health.executor.localActive, false);
    assert.equal(health.executor.ready, false);
  } finally {
    await new Promise((resolve) => http.close(resolve));
    await database.close();
  }
});
