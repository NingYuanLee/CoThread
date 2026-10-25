import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  createOrganization,
  setOrganizationMember,
  changeProjectOrganizationLink,
} from "../server/organizations.js";
import { createWikiPage, getWikiPage } from "../server/wiki-pages.js";
import { loginLanding, readOrgShelf } from "../server/org-shelf.js";
import { askWikiQuestion } from "../server/wiki-questions.js";

test("newcomers with a primary org and no active iteration land on that org, and outsiders cannot read project pages", async () => {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const admin = { id: randomUUID(), kind: "session" };
    const newcomer = { id: randomUUID(), kind: "session" };
    const plain = { id: randomUUID(), kind: "session" };
    for (const user of [
      [admin, "管理员"],
      [newcomer, "新人"],
      [plain, "无组织"],
    ]) {
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,\'unused\')", [
        user[0].id,
        user[0].id + "@test.com",
        user[1],
      ]);
    }
    const roleId = randomUUID();
    await query(
      db,
      "INSERT INTO roles(id,scope,name,description,permissions,is_builtin,created_by) VALUES(?,?,?,?,?,FALSE,?)",
      [
        roleId,
        "platform",
        "组织维护",
        "",
        JSON.stringify(["orgs", "orgs.update", "orgs.assign", "orgs.link"]),
        admin.id,
      ],
    );
    await query(db, "INSERT INTO admin_user_roles(user_id,role_id) VALUES(?,?)", [
      admin.id,
      roleId,
    ]);
    const host = await createOrganization(db, admin, { name: "新人部" });
    await setOrganizationMember(db, admin, host.id, { userId: newcomer.id, kind: "primary" });
    const before = await loginLanding(db, newcomer);
    assert.equal(before.destination, "org");
    assert.equal(before.orgId, host.id);
    const noOrg = await loginLanding(db, plain);
    assert.equal(noOrg.destination, "workspace");
    const project = await service.createProject(admin, { name: "进行中的项目" });
    await changeProjectOrganizationLink(db, admin, project.id, {
      action: "set-host",
      orgId: host.id,
    });
    const secret = "未加入的人不能看见的正文";
    const page = await createWikiPage(service, admin, project.id, {
      kind: "guide",
      title: "内部指南",
      body: secret,
    });
    const shelf = await readOrgShelf(service, newcomer, host.id);
    assert.equal(shelf.projects[0].pages[0].title, "内部指南");
    assert.equal(JSON.stringify(shelf).includes(secret), false);
    await assert.rejects(
      getWikiPage(service, newcomer, project.id, page.page.id),
      (error) => error.status === 403,
    );
    await assert.rejects(
      askWikiQuestion(
        service,
        newcomer,
        project.id,
        { body: "内部指南" },
        { answer: async () => "不行" },
      ),
      (error) => error.status === 403,
    );
    const thread = await service
      .createThread(newcomer, project.id, { title: "不该由新人开" })
      .catch(() => null);
    const opened = thread || (await service.createThread(admin, project.id, { title: "进行中" }));
    const during = await loginLanding(db, admin);
    assert.equal(during.destination, "workspace");
    await query(
      db,
      "UPDATE threads SET status=\'archived\', archived_at=CURRENT_TIMESTAMP(3) WHERE id=?",
      [opened.id],
    );
    const after = await loginLanding(db, newcomer);
    assert.equal(after.destination, "org");
    const [messages] = await query(db, "SELECT COUNT(*) count FROM messages");
    assert.equal(Number(messages.count), 0);
  } finally {
    await database.close();
  }
});
