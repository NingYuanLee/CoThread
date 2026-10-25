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
import { createWikiPage } from "../server/wiki-pages.js";
import {
  createCompanyGuide,
  createOrgGuide,
  readCompanyCatalog,
  readOrgShelf,
} from "../server/org-shelf.js";
import { askCompanyQuestion, askOrgQuestion } from "../server/wiki-questions.js";

test("hosted projects stay linked, participants only get briefs, and questions cannot cross scopes", async () => {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const admin = { id: randomUUID(), kind: "session" };
    const participant = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const user of [
      [admin, "管理员"],
      [participant, "参与者"],
      [outsider, "外人"],
    ]) {
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
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
    const host = await createOrganization(db, admin, { name: "主办部" });
    const guest = await createOrganization(db, admin, { name: "参与部" });
    await setOrganizationMember(db, admin, host.id, { userId: admin.id, kind: "primary" });
    await setOrganizationMember(db, admin, guest.id, { userId: participant.id, kind: "primary" });
    const project = await service.createProject(admin, { name: "跨部门项目" });
    await changeProjectOrganizationLink(db, admin, project.id, {
      action: "set-host",
      orgId: host.id,
    });
    await changeProjectOrganizationLink(db, admin, project.id, {
      action: "add-participant",
      orgId: guest.id,
    });
    const secret = "只有项目成员能看见的原句";
    const page = await createWikiPage(service, admin, project.id, {
      kind: "guide",
      title: "入门指南",
      body: secret,
    });
    const guestShelf = await readOrgShelf(service, participant, guest.id);
    assert.equal(guestShelf.projects.length, 0);
    assert.equal(guestShelf.briefs.length, 1);
    assert.equal(guestShelf.briefs[0].brief, "《入门指南》有更新");
    assert.equal(JSON.stringify(guestShelf).includes(secret), false);
    const hostShelf = await readOrgShelf(service, admin, host.id);
    assert.equal(hostShelf.projects[0].pages[0].title, page.page.title);
    assert.equal(hostShelf.projects[0].pages[0].body, undefined);
    assert.equal(hostShelf.briefs.length, 0);
    await assert.rejects(
      readOrgShelf(service, outsider, guest.id),
      (error) => error.status === 403,
    );
    await createOrgGuide(service, participant, guest.id, { title: "参与部指南", body: "先看简报" });
    const asked = await askOrgQuestion(
      service,
      participant,
      guest.id,
      { body: "入门指南" },
      {
        answer: async ({ pages }) => {
          const packed = JSON.stringify(pages);
          assert.equal(packed.includes(secret), false);
          assert.equal(packed.includes("《入门指南》有更新"), true);
          assert.equal(packed.includes("参与部指南"), true);
          return "看简报和参与部指南。";
        },
      },
    );
    assert.match(asked.turn.answer.citations.map((item) => item.label).join(" "), /参与简报/);
    await assert.rejects(
      askOrgQuestion(
        service,
        outsider,
        guest.id,
        { body: "入门指南" },
        { answer: async () => "不行" },
      ),
      (error) => error.status === 403,
    );
    await createCompanyGuide(service, admin, { title: "公司指南", body: "公司只写人工指南" });
    const catalog = await readCompanyCatalog(service, participant);
    assert.equal(
      catalog.orgs.some((org) => org.name === "主办部"),
      true,
    );
    assert.equal(JSON.stringify(catalog).includes(secret), false);
    assert.equal(catalog.canWrite, false);
    await assert.rejects(
      createCompanyGuide(service, participant, { title: "越权", body: "不行" }),
      (error) => error.status === 403,
    );
    await askCompanyQuestion(
      service,
      participant,
      { body: secret },
      {
        answer: async ({ pages }) => {
          assert.equal(JSON.stringify(pages).includes(secret), false);
          return "项目原句不在公司范围。";
        },
      },
    );
    const company = await askCompanyQuestion(
      service,
      participant,
      { body: "公司指南" },
      {
        answer: async ({ pages }) => {
          assert.equal(JSON.stringify(pages).includes(secret), false);
          assert.equal(
            pages.some((item) => item.page.title === "公司指南"),
            true,
          );
          return "只看到公司指南。";
        },
      },
    );
    assert.match(company.turn.answer.citations[0].label, /公司指南/);
    await changeProjectOrganizationLink(db, admin, project.id, {
      action: "remove-participant",
      orgId: guest.id,
    });
    const after = await readOrgShelf(service, participant, guest.id);
    assert.equal(after.briefs.length, 0);
  } finally {
    await database.close();
  }
});
