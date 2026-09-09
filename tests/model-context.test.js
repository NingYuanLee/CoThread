import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../server/mcp.js";
import { createAgentTools } from "../server/agent-tools.js";
import { modelDiscussion } from "../server/model-context.js";

const threadId = "ede432bd-69c1-4a65-924d-c50aec6999dc";
const avatar = "data:image/png;base64," + "A".repeat(200_000);
const message = { id: "message", author_id: "user", author: "成员", author_role: "产品", body: "请梳理讨论中的图片附件", refs: ["image-version"], author_avatar: avatar };
const members = [{ id: "user", name: "成员", email: "member@example.com", role: "editor", motto: "个人签名", identity_tags: ["产品"], avatar }];
const context = {
  id: threadId, project_id: "project", status: "active",
  messages: Array.from({ length: 22 }, (_, sequence) => ({ ...message, sequence })),
  members,
  archive_snapshot: { messages: [message], members, conclusion: "保留归档结论" },
  reviews: [{ decision: "approved", comment: "保留审核" }],
  runs: [{ status: "succeeded", output: "tests passed" }], replies: [],
  contextUsage: { used: 1_000_000 },
  events: [{ id: 1, tool: "read_iteration", status: "completed", input: "{}", output: JSON.stringify({ messages: [message] }).slice(0, 30000) }],
};
const project = { id: "project", members, versions: [{ id: "image-version", mime: "image/png" }] };

function checkDiscussion(result) {
  assert.equal(result.messages.length, 22);
  assert.equal(result.messages[0].body, message.body);
  assert.equal(result.messages[0].author_id, message.author_id);
  assert.equal(result.messages[0].author, message.author);
  assert.equal(result.messages[0].author_role, "产品");
  assert.equal(result.archive_snapshot.messages[0].author_role, "产品");
  assert.deepEqual(result.members, [{ id: "user", name: "成员", role: "editor" }]);
  assert.deepEqual(result.archive_snapshot.members, result.members);
  assert.deepEqual(result.messages[0].refs, message.refs);
  assert.equal(result.archive_snapshot.conclusion, "保留归档结论");
  assert.deepEqual(result.reviews, context.reviews);
  assert.deepEqual(result.runs, context.runs);
  assert.equal(result.events[0].status, "completed");
  assert.ok(!("output" in result.events[0]));
  assert.ok(!JSON.stringify(result).includes("data:image"));
  assert.ok(JSON.stringify(result).length < 10_000);
  assert.equal(context.messages[0].author_avatar, avatar);
  assert.equal(context.archive_snapshot.messages[0].author_avatar, avatar);
  assert.equal(context.messages[0].author_role, "产品");
  assert.equal(context.members[0].email, "member@example.com");
}

test("model discussion removes repeated avatars and legacy tool payloads without losing content", () => {
  checkDiscussion(modelDiscussion(context));
});

test("built-in read_iteration and project_context return compact results and log no avatars", async () => {
  const outputs = [];
  const service = {
    db: { execute: async (sql, args) => {
      if (sql.startsWith("SELECT status")) return [[{ status: "running" }]];
      if (sql.startsWith("UPDATE agent_events SET status='completed'")) outputs.push(args[0]);
      return [{ insertId: 1 }];
    } },
    thread: async () => context, member: async () => ({}),
    context: async () => context, project: async () => project,
  };
  const call = createAgentTools(service, { id: "user" }, { thread_id: threadId, message_id: "message" });
  checkDiscussion(await call("read_iteration", { threadId }));
  const result = await call("project_context", {});
  assert.deepEqual(result.members, [{ id: "user", name: "成员", role: "editor" }]);
  assert.equal(result.versions[0].mime, "image/png");
  assert.ok(outputs.every((output) => !output.includes("data:image")));
  assert.equal(project.members[0].avatar, avatar);
});

test("MCP filters context avatars but retains explicitly requested document bytes", async () => {
  const server = createMcpServer({
    context: async () => context, project: async () => project,
    version: async () => ({ id: "image-version", mime: "image/png", content: Buffer.from("actual image bytes") }),
  }, { id: "user" });
  const client = new Client({ name: "regression-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError);
      return JSON.parse(result.content[0].text);
    };
    checkDiscussion(await call("get_iteration_context", { threadId }));
    const result = await call("get_project", { projectId: threadId });
    assert.deepEqual(result.members, [{ id: "user", name: "成员", role: "editor" }]);
    assert.deepEqual(result.versions, project.versions);
    const document = await call("get_document_version", { versionId: threadId });
    assert.equal(Buffer.from(document.contentBase64, "base64").toString(), "actual image bytes");
  } finally {
    await client.close();
    await server.close();
  }
});
