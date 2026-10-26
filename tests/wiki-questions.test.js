import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createWikiPage } from "../server/wiki-pages.js";
import {
  askWebQuestion,
  askWikiQuestion,
  listWebQuestions,
  listWikiQuestions,
} from "../server/wiki-questions.js";

test("project members ask the elder privately and new group messages cannot select chat", async () => {
  const database = await testDatabase();
  try {
    const db = database.db;
    const service = new Service(db);
    const owner = { id: randomUUID(), kind: "session" };
    const other = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const user of [
      [owner, "提问者"],
      [other, "另一人"],
      [outsider, "外人"],
    ]) {
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,\'unused\')", [
        user[0].id,
        user[0].id + "@test.com",
        user[1],
      ]);
    }
    const project = await service.createProject(owner, { name: "私聊项目" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,\'member\')", [
      project.id,
      other.id,
    ]);
    const thread = await service.createThread(owner, project.id, { title: "群" });
    await service.postMessage(owner, thread.id, { body: "群里原话" });
    const created = await createWikiPage(service, owner, project.id, {
      kind: "guide",
      title: "入门指南",
      body: "新人先看知识页，不要在群里开有问必答。",
    });
    const beforeMessages = await query(db, "SELECT id FROM messages");
    const beforeTasks = await query(db, "SELECT id FROM agent_tasks");
    const asked = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "新人先看什么" },
      {
        answer: async ({ pages }) => {
          assert.equal(pages.length, 1);
          assert.equal(pages[0].page.title, "入门指南");
          return "先看入门指南。";
        },
      },
    );
    assert.equal(asked.turn.answer.body, "先看入门指南。");
    assert.equal(asked.turn.answer.citations[0].pageId, created.page.id);
    assert.equal(asked.turn.answer.citations[0].kind, "wiki");
    assert.equal(asked.turn.answer.citations[0].target, created.page.id);
    assert.match(asked.turn.answer.citations[0].label, /入门指南/);
    const own = await listWikiQuestions(service, owner, project.id);
    assert.equal(own.turns.length, 1);
    const theirs = await listWikiQuestions(service, other, project.id);
    assert.equal(theirs.turns.length, 0);
    await assert.rejects(
      listWikiQuestions(service, outsider, project.id),
      (error) => error.status === 403,
    );
    await assert.rejects(
      service.postMessage(owner, thread.id, { body: "还想问", dialogueMode: "chat" }),
      (error) => error.status === 400,
    );
    const afterMessages = await query(db, "SELECT id FROM messages");
    const afterTasks = await query(db, "SELECT id FROM agent_tasks");
    assert.equal(afterMessages.length, beforeMessages.length);
    assert.equal(afterTasks.length, beforeTasks.length);
    const [kept] = await query(db, "SELECT body FROM messages WHERE thread_id=?", [thread.id]);
    assert.equal(kept.body, "群里原话");
    let seen = "";
    const web = await askWebQuestion(
      service,
      owner,
      { body: "外面怎么说" },
      {
        search: async () => [
          { title: "公开页", url: "https://example.com/a", snippet: "公开网络上的说法" },
        ],
        answer: async ({ pages }) => {
          seen = JSON.stringify(pages);
          return pages.map((item) => item.page.title).join("");
        },
      },
    );
    assert.equal(seen.includes("入门指南"), false);
    assert.equal(seen.includes("不要在群里开有问必答"), false);
    assert.equal(web.turn.answer.body, "公开页");
    assert.equal(web.turn.answer.trace[0].tool, "search_web");
    const webCite = web.turn.answer.citations.find((item) => item.label.includes("公开页"));
    assert.equal(webCite.kind, "web");
    assert.equal(webCite.target, "https://example.com/a");
    const second = await service.createProject(owner, { name: "第二项目" });
    await createWikiPage(service, owner, second.id, {
      kind: "guide",
      title: "第二页",
      body: "范围口令在第二项目。",
    });
    const foreign = await service.createProject(outsider, { name: "外人项目" });
    await createWikiPage(service, outsider, foreign.id, {
      kind: "guide",
      title: "外人页",
      body: "范围口令在外人项目。",
    });
    await query(
      db,
      "INSERT INTO company_guides(id,title,body,status,created_by,updated_by) VALUES(?,?,?,'current',?,?)",
      [randomUUID(), "公开指南", "范围口令在公司公开指南。", owner.id, owner.id],
    );
    const wider = await askWebQuestion(
      service,
      owner,
      { body: "范围口令", organization: true },
      {
        search: async () => [
          { title: "公开页", url: "https://example.com/a", snippet: "公开网络上的说法" },
        ],
        answer: async ({ pages }) => pages.map((item) => item.page.title).join(","),
      },
    );
    assert.match(wider.turn.answer.body, /第二页/);
    assert.match(wider.turn.answer.body, /公开指南/);
    assert.match(wider.turn.answer.body, /公开页/);
    assert.equal(wider.turn.answer.body.includes("外人页"), false);
    assert.ok(wider.turn.answer.trace.some((step) => step.tool === "search_wiki"));
    assert.ok(wider.turn.answer.trace.some((step) => step.tool === "search_web"));
    const listed = await listWebQuestions(service, owner);
    assert.equal(listed.turns.length, 2);
    const [official] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
      [project.id],
    );
    await service.uploadOfficialDocument(owner, project.id, {
      folderId: official.id,
      title: "文档口令",
      filename: "note.txt",
      mime: "text/plain",
      contentBase64: Buffer.from("文档口令写在项目文档里").toString("base64"),
    });
    const document = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "文档口令" },
      {
        answer: async ({ pages }) =>
          pages.map((item) => item.page.title + ":" + item.page.kind).join(","),
      },
    );
    assert.match(document.turn.answer.body, /文档口令:document/);
    await query(
      db,
      `INSERT INTO agent_tasks(id,project_id,origin_thread_id,source_type,source_user_id,created_by_type,created_by_id,task_type,title,goal,status)
       VALUES(?,?,?,'human_member',?,'human_member',?,'formal','口令任务','只读任务目标','draft')`,
      [randomUUID(), project.id, thread.id, owner.id, owner.id],
    );
    const messagesBeforeRead = await query(db, "SELECT id FROM messages");
    const tasksBeforeRead = await query(db, "SELECT id FROM agent_tasks");
    const readMessage = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "群里原话" },
      {
        answer: async ({ pages }) =>
          pages.map((item) => item.page.kind + ":" + item.page.body).join("\n"),
      },
    );
    assert.match(readMessage.turn.answer.body, /message:群里原话/);
    const readTask = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "口令任务" },
      {
        answer: async ({ pages }) =>
          pages.map((item) => item.page.kind + ":" + item.page.title).join(","),
      },
    );
    assert.match(readTask.turn.answer.body, /task:口令任务/);
    const readMember = await askWikiQuestion(
      service,
      owner,
      project.id,
      { body: "提问者" },
      {
        answer: async ({ pages }) =>
          pages.map((item) => item.page.kind + ":" + item.page.title).join(","),
      },
    );
    assert.match(readMember.turn.answer.body, /member:提问者/);
    assert.equal((await query(db, "SELECT id FROM messages")).length, messagesBeforeRead.length);
    assert.equal((await query(db, "SELECT id FROM agent_tasks")).length, tasksBeforeRead.length);
    // 轨迹接口：老翁问答要给出系统提示词与只读工具清单，且不能出现写工具。
    const { elderAgentLogs } = await import("../server/wiki-session.js");
    await query(
      db,
      "INSERT IGNORE INTO wiki_sessions(id,user_id,scope_key,scope,project_id,session_id) " +
        "VALUES(?,?,?,?,?,?)",
      [randomUUID(), owner.id, `project:${project.id}`, "project", project.id, randomUUID()],
    );
    const elderLogs = await elderAgentLogs(db, owner, "project", { projectId: project.id });
    assert.match(elderLogs.systemPrompt, /只能使用只读工具/);
    assert.equal(elderLogs.tools.includes("search_knowledge"), false);
    assert.ok(elderLogs.tools.includes("search_memory"));
    assert.match(elderLogs.systemPrompt, /关键发言/);
    assert.equal(/知识页/.test(elderLogs.systemPrompt), false);
    assert.ok(elderLogs.tools.includes("get_project_context"));
    assert.equal(elderLogs.tools.includes("post_message"), false);
    assert.equal(elderLogs.tools.includes("web_search"), false);
    assert.ok((await elderAgentLogs(db, owner, "web", {})).tools.includes("web_search"));
    // 还没有任何轨迹时也要能给出提示词与工具，事件为空即可。
    const emptyElder = await elderAgentLogs(db, other, "project", { projectId: project.id });
    assert.deepEqual(emptyElder.events, []);
    assert.match(emptyElder.systemPrompt, /只能使用只读工具/);
  } finally {
    await database.close();
  }
});
