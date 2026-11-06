import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.ts";
import { Service } from "../server/service.ts";
import { createAgentTools } from "../server/agent-tools.ts";

/**
 * cloudbase_auth_config 之前读的是作用域外的 `runtime`：那个变量只在 MINIPROGRAM 分支
 * 的块作用域里声明过，CloudBase 分支是兄弟分支，读不到 → 运行期 ReferenceError，
 * 又被工具层的兜底吞掉，表现是「永远拿不到鉴权配置」。
 * 迁移时把 requireMiniprogramWorkspace 的返回值绑定成 runtime 修好了它，
 * 这个用例守住这条路径，别再退回成静默失败。
 */
test("cloudbase_auth_config 返回项目的小程序与 CloudBase 鉴权配置", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@example.test`,
      "CloudBase 工具测试",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "CloudBase 工具" });
    const thread = await service.createThread(user, project.id, { title: "读取鉴权配置" });
    const message = await service.postMessage(user, thread.id, { body: "读取 CloudBase 鉴权配置" });

    await query(
      db,
      "INSERT INTO project_miniprogram_config(project_id,enabled,cloudbase_envs,status) VALUES(?,1,?,'configured')",
      [project.id, JSON.stringify({ development: { envId: "env-test-1", region: "ap-shanghai" } })],
    );
    await query(
      db,
      `INSERT INTO project_miniprogram_apps(id,project_id,name,app_id,role,main_project_id)
       VALUES(?,?,?,?,'main',?)`,
      [randomUUID(), project.id, "主小程序", "wx-test-app", project.id],
    );

    const call = createAgentTools(
      service,
      user,
      { message_id: message.id, thread_id: thread.id },
      {
        role: "coordinator",
        xiaoxiangSessionId: thread.id,
      },
    );
    const result = await call("cloudbase_auth_config", { environment: "development" });

    assert.equal(result.environment, "development");
    assert.equal(result.envId, "env-test-1");
    assert.equal(result.miniprogram.openIdLogin, true);
    assert.equal(result.miniprogram.phoneAuth, false);
    assert.equal(result.admin.passwordLogin, true);
    assert.equal(result.publishableKey, null);
  } finally {
    await database.close();
  }
});
