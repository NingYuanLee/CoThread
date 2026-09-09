import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

test("project tabs persist per user, restore opening order, and never remove projects", async () => {
  const database = await testDatabase();
  try {
    const service = new Service(database.db);
    const owner = { id: randomUUID(), kind: "session" };
    const viewer = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const user of [owner, viewer, outsider]) {
      await query(
        database.db,
        "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
        [user.id, `${user.id}@example.com`, "Tabs test", "unused"],
      );
    }
    const first = await service.createProject(owner, { name: "First" });
    const second = await service.createProject(owner, { name: "Second" });
    await query(
      database.db,
      "UPDATE members SET tab_opened_at=? WHERE project_id=?",
      ["2026-01-01 00:00:00", first.id],
    );
    await query(
      database.db,
      "UPDATE members SET tab_opened_at=? WHERE project_id=?",
      ["2026-01-02 00:00:00", second.id],
    );
    const visible = (rows) =>
      rows.filter((p) => p.tab_visible).map((p) => p.id);
    assert.deepEqual(visible(await service.projects(owner)), [
      second.id,
      first.id,
    ]);
    const openingTime = (await service.projects(owner)).find(
      (p) => p.id === first.id,
    ).tab_opened_at;
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, first.id, { action: "pin" }),
      ),
      [first.id, second.id],
    );
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, first.id, { action: "close" }),
      ),
      [first.id, second.id],
    );
    const unpinned = await service.updateProjectTab(owner, first.id, {
      action: "unpin",
    });
    assert.deepEqual(visible(unpinned), [second.id, first.id]);
    assert.equal(
      unpinned.find((p) => p.id === first.id).tab_opened_at,
      openingTime,
    );
    await service.updateProjectTab(owner, first.id, { action: "pin" });
    await service.updateProjectTab(owner, second.id, { action: "pin" });
    assert.deepEqual(
      visible(
        await service.reorderProjectTabs(owner, {
          projectIds: [first.id, second.id],
        }),
      ),
      [first.id, second.id],
    );
    assert.deepEqual(visible(await new Service(database.db).projects(owner)), [
      first.id,
      second.id,
    ]);
    for (const projectIds of [
      [first.id],
      [first.id, first.id],
      [first.id, randomUUID()],
    ]) {
      await assert.rejects(service.reorderProjectTabs(owner, { projectIds }), {
        status: 409,
      });
    }
    await assert.rejects(
      service.reorderProjectTabs(outsider, {
        projectIds: [first.id, second.id],
      }),
      { status: 409 },
    );
    await assert.rejects(
      service.reorderProjectTabs(
        { ...owner, kind: "api" },
        { projectIds: [first.id, second.id] },
      ),
      { status: 403 },
    );
    assert.deepEqual(visible(await service.projects(owner)), [
      first.id,
      second.id,
    ]);
    assert.deepEqual(
      visible(
        await service.reorderProjectTabs(owner, {
          projectIds: [second.id, first.id],
        }),
      ),
      [second.id, first.id],
    );
    await service.updateProjectTab(owner, first.id, { action: "unpin" });
    await service.updateProjectTab(owner, second.id, { action: "unpin" });
    assert.equal(
      (await service.projects(owner)).find((p) => p.id === first.id)
        .tab_opened_at,
      openingTime,
    );
    await assert.rejects(
      service.reorderProjectTabs(owner, { projectIds: [first.id, second.id] }),
      { status: 409 },
    );
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, first.id, { action: "open" }),
      ),
      [second.id, first.id],
    );

    await query(
      database.db,
      "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'viewer')",
      [first.id, viewer.id],
    );
    assert.deepEqual(visible(await service.projects(viewer)), []);
    assert.deepEqual(
      visible(
        await service.updateProjectTab(viewer, first.id, { action: "open" }),
      ),
      [first.id],
    );
    await service.updateProjectTab(viewer, first.id, { action: "pin" });
    await service.reorderProjectTabs(viewer, { projectIds: [first.id] });
    assert.ok((await service.projects(owner)).every((p) => !p.tab_pinned_at));
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, first.id, { action: "close" }),
      ),
      [second.id],
    );
    assert.ok((await service.projects(viewer))[0].tab_pinned_at);
    assert.equal((await service.project(owner, first.id)).name, "First");
    assert.deepEqual(visible(await new Service(database.db).projects(owner)), [
      second.id,
    ]);
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, first.id, { action: "open" }),
      ),
      [first.id, second.id],
    );
    await service.updateProjectTab(owner, first.id, { action: "close" });
    assert.deepEqual(
      visible(
        await service.updateProjectTab(owner, second.id, { action: "close" }),
      ),
      [],
    );
    assert.equal((await service.projects(owner)).length, 2);
    await assert.rejects(
      service.updateProjectTab(outsider, first.id, { action: "open" }),
      { status: 403 },
    );
    await assert.rejects(
      service.updateProjectTab({ ...owner, kind: "api" }, first.id, {
        action: "open",
      }),
      { status: 403 },
    );
    await assert.rejects(
      service.updateProjectTab(owner, first.id, { action: "delete" }),
    );
  } finally {
    await database.close();
  }
});
