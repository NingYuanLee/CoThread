import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { processNextProjectMemory } from "../server/project-memory.js";
import {
  discoverNextFileIndexChange,
  reconcileNextFileIndexArtifact,
} from "../server/file-index-discovery.js";

test("真实 DSH 注册文件摘要工具并通过工具提交", { timeout: 90000 }, async () => {
  const database = await testDatabase();
  const db = database.db;
  let provider,
    requests = 0,
    offered = false;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@test.com`,
      "成员",
    ]);
    const service = new Service(db),
      project = await service.createProject(user, { name: "工具运行时" }),
      thread = await service.createThread(user, project.id, { title: "文件" });
    const version = await service.submitVersion(
      user,
      thread.id,
      {
        title: "工具测试",
        filename: "tool.txt",
        contentBase64: Buffer.from("可核验正文").toString("base64"),
      },
      undefined,
      undefined,
      false,
      { silent: true },
    );
    while (await discoverNextFileIndexChange(db)) {}
    while (await reconcileNextFileIndexArtifact(db)) {}
    provider = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      requests++;
      if (requests === 1)
        offered = JSON.stringify(input.tools || []).includes("save_file_index_summary");
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const event = (value) => res.write(`data: ${JSON.stringify(value)}\n\n`);
      if (requests === 1) {
        const item = {
          id: "fc_1",
          type: "function_call",
          call_id: "call_1",
          name: "save_file_index_summary",
          arguments: JSON.stringify({ summary: "基于正文的摘要", topics: ["测试"], ocrText: "" }),
          status: "completed",
        };
        event({
          type: "response.output_item.added",
          output_index: 0,
          item: { ...item, arguments: "", status: "in_progress" },
        });
        event({
          type: "response.function_call_arguments.delta",
          item_id: "fc_1",
          output_index: 0,
          delta: item.arguments,
        });
        event({
          type: "response.function_call_arguments.done",
          item_id: "fc_1",
          output_index: 0,
          arguments: item.arguments,
        });
        event({ type: "response.output_item.done", output_index: 0, item });
        event({
          type: "response.completed",
          response: {
            id: "resp_1",
            status: "completed",
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        });
      } else {
        event({
          type: "response.output_item.added",
          output_index: 0,
          item: {
            type: "message",
            id: "msg_1",
            role: "assistant",
            status: "in_progress",
            content: [],
          },
        });
        event({
          type: "response.content_part.added",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        });
        event({
          type: "response.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: "已提交",
        });
        event({
          type: "response.output_text.done",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          text: "已提交",
        });
        event({
          type: "response.content_part.done",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "已提交", annotations: [] },
        });
        event({
          type: "response.output_item.done",
          output_index: 0,
          item: {
            type: "message",
            id: "msg_1",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "已提交", annotations: [] }],
          },
        });
        event({
          type: "response.completed",
          response: {
            id: "resp_2",
            status: "completed",
            output: [
              {
                type: "message",
                id: "msg_1",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "已提交", annotations: [] }],
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        });
      }
      res.end();
    });
    await new Promise((done) => provider.listen(0, "127.0.0.1", done));
    await processNextProjectMemory(db, {
      projectId: project.id,
      task: "document_memory",
      laowengOptions: {
        model: {
          baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
          model: "test",
          apiKey: "fixture",
        },
      },
    });
    const [summary] = await query(
      db,
      "SELECT summary FROM agent_document_summaries WHERE version_id=?",
      [version.id],
    );
    assert.equal(offered, true);
    assert.ok(requests >= 2);
    assert.equal(summary?.summary, "基于正文的摘要");
    assert.equal(
      (
        await query(db, "SELECT attempt_id FROM file_index_tool_submissions WHERE version_id=?", [
          version.id,
        ])
      ).length,
      1,
    );
  } finally {
    if (provider) await new Promise((resolve) => provider.close(resolve));
    await database.close();
  }
});
