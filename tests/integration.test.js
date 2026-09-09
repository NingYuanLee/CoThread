import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { openAgentRuntime } from "../server/agent.js";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { Service } from "../server/service.js";
import { executeRun } from "../server/acs.js";
import { testDatabase } from "./database.js";
import { createAgentTools } from "../server/agent-tools.js";
import { relativePath } from "../server/agent-sandbox.js";
import { processNextReply, retryReply } from "../server/replies.js";
import { processNextContextCompression } from "../server/context-compression.js";

let database;
let db,
  server,
  base,
  owner,
  outsider,
  viewer,
  project,
  iteration,
  version1,
  apiToken;
const userIds = [];
const projectIds = [];
const password = "Test-only!Password-" + randomUUID();
async function request(path, data, credential, method) {
  const res = await fetch(`${base}/api${path}`, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(credential?.cookie ? { Cookie: credential.cookie } : {}),
      ...(credential?.token
        ? { Authorization: `Bearer ${credential.token}` }
        : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await res.json();
  return {
    status: res.status,
    body: result,
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  database = await testDatabase();
  db = database.db;
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  async function user(name) {
    const id = randomUUID();
    const email = `test-${id}@example.com`;
    userIds.push(id);
    await query(
      db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
      [id, email, name, await hashPassword(password)],
    );
    const result = await request("/login", { email, password });
    assert.equal(result.status, 200);
    return { ...result, id, email, kind: "session" };
  }
  owner = await user("Owner");
  outsider = await user("Outsider");
  viewer = await user("Viewer");
});
// Each test owns its worker queue; unrelated fixture discussion is not processed.
beforeEach(async () => {
  await query(
    db,
    "UPDATE assistant_replies SET status='cancelled' WHERE status IN ('queued','running')",
  );
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await query(db, "DELETE FROM notifications");
  for (const projectId of projectIds) {
    await query(
      db,
      "DELETE r FROM reviews r JOIN versions v ON v.id=r.version_id JOIN artifacts a ON a.id=v.artifact_id WHERE a.project_id=?",
      [projectId],
    );
    await query(
      db,
      "DELETE s FROM sandbox_runs s JOIN threads t ON t.id=s.thread_id WHERE t.project_id=?",
      [projectId],
    );
    await query(
      db,
      "DELETE m FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.project_id=?",
      [projectId],
    );
    await query(
      db,
      "DELETE v FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE a.project_id=?",
      [projectId],
    );
    await query(db, "DELETE FROM artifacts WHERE project_id=?", [projectId]);
    await query(
      db,
      "UPDATE document_folders SET parent_id=NULL WHERE project_id=?",
      [projectId],
    );
    await query(db, "DELETE FROM document_folders WHERE project_id=?", [
      projectId,
    ]);
    await query(db, "DELETE FROM threads WHERE project_id=?", [projectId]);
    await query(db, "DELETE FROM members WHERE project_id=?", [projectId]);
    await query(db, "DELETE FROM projects WHERE id=?", [projectId]);
  }
  for (const id of userIds) {
    await query(db, "DELETE FROM credentials WHERE user_id=?", [id]);
    await query(db, "DELETE FROM users WHERE id=?", [id]);
  }
  await database.close();
});
test("authentication, project scope, origin validation, and viewer permissions", async () => {
  assert.equal((await request("/projects")).status, 401);
  const res = await request(
    "/projects",
    { name: "Integration project", description: "Temporary test data" },
    owner,
  );
  assert.equal(res.status, 201);
  project = res.body.id;
  projectIds.push(project);
  assert.equal(
    (await request(`/projects/${project}`, undefined, outsider)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${project}/members`,
        { name: "Viewer", email: viewer.email, role: "viewer" },
        owner,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/projects/${project}/threads`,
        { title: "Forbidden" },
        viewer,
      )
    ).status,
    403,
  );
  const thread = await request(
    `/projects/${project}/threads`,
    { title: "Iteration 1" },
    owner,
  );
  assert.equal(thread.status, 201);
  iteration = thread.body.id;
  assert.equal(
    (
      await request(
        `/threads/${iteration}/messages`,
        { body: "Forbidden" },
        viewer,
      )
    ).status,
    403,
  );
  const origin = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: "https://evil.example",
    },
    body: '{"name":"Bad"}',
  });
  assert.equal(origin.status, 403);
});
test("human and local AI identities cannot be forged; account token cannot mint credentials or approve", async () => {
  const minted = await request(
    "/tokens",
    { projectId: project, label: "Test AI" },
    owner,
  );
  assert.equal(minted.status, 201);
  apiToken = minted.body.token;
  const sent = await request(
    `/threads/${iteration}/messages`,
    { body: "From local AI", authorId: outsider.id, source: "human" },
    { token: apiToken },
  );
  assert.equal(sent.status, 201);
  const context = await request(`/threads/${iteration}`, undefined, owner);
  assert.equal(context.body.messages[0].author_id, owner.id);
  assert.equal(context.body.messages[0].source, "local_ai");
  const created = new Date(
    context.body.messages[0].created_at.replace(" ", "T") + "Z",
  );
  assert.ok(
    Math.abs(Date.now() - created.getTime()) < 60000,
    "Database timestamps must be returned in UTC",
  );
  assert.equal(
    (
      await request(
        "/tokens",
        { projectId: project, label: "Bad" },
        { token: apiToken },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/threads/${iteration}/archive`,
        { conclusion: "Bad" },
        { token: apiToken },
      )
    ).status,
    403,
  );
  const other = await request("/projects", { name: "Other scope" }, owner);
  projectIds.push(other.body.id);
  assert.equal(
    (
      await request(`/projects/${other.body.id}`, undefined, {
        token: apiToken,
      })
    ).status,
    200,
  );
});
test("binary versions, sequential concurrent submissions, review history and reference integrity", async () => {
  const payload = Buffer.from([0, 255, 1, 128, 13, 10]);
  const data = {
    title: "PRD",
    filename: "规格.bin",
    mime: "application/octet-stream",
    contentBase64: payload.toString("base64"),
  };
  const first = await request(`/threads/${iteration}/versions`, data, {
    token: apiToken,
  });
  assert.equal(first.status, 201);
  version1 = first.body;
  const downloaded = await fetch(
    `${base}/api/versions/${version1.id}/download`,
    { headers: { Cookie: owner.cookie } },
  );
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), payload);
  assert.equal(
    (
      await request(
        `/versions/${version1.id}/reviews`,
        { decision: "approved" },
        { token: apiToken },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/versions/${version1.id}/reviews`,
        { decision: "approved", comment: "Verified" },
        owner,
      )
    ).status,
    201,
  );
  const more = await Promise.all(
    [1, 2].map((n) =>
      request(
        `/threads/${iteration}/versions`,
        { ...data, artifactId: version1.artifactId, note: String(n) },
        owner,
      ),
    ),
  );
  assert.deepEqual(
    more.map((x) => x.status),
    [201, 201],
  );
  assert.deepEqual(more.map((x) => x.body.version).sort(), [2, 3]);
  assert.equal(
    (
      await request(
        `/threads/${iteration}/messages`,
        { body: "Invalid reference", refs: [randomUUID()] },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/threads/${iteration}/versions`,
        { ...data, filename: "../escape.txt" },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/threads/${iteration}/messages`,
        { body: "Based on original", refs: [version1.id] },
        owner,
      )
    ).status,
    201,
  );
});
test("MCP initialize, list tools and context over authenticated Streamable HTTP", async () => {
  const call = async (body) => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200);
    return res.json();
  };
  const initialized = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "Integration test", version: "1" },
    },
  });
  assert.equal(initialized.result.serverInfo.name, "cothread");
  const listed = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  assert.equal(listed.result.tools.length, 11);
  assert.match(initialized.result.instructions, /get_connection_guide/);
  assert.match(initialized.result.instructions, /post_message/);
  const context = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "get_iteration_context",
      arguments: { threadId: iteration },
    },
  });
  assert.equal(JSON.parse(context.result.content[0].text).id, iteration);
});
test("failed ACS execution retains team data and records failure without exposing provider credentials", async () => {
  const saved = {
    key: process.env.E2B_API_KEY,
    domain: process.env.E2B_DOMAIN,
  };
  process.env.E2B_API_KEY = "test-secret";
  process.env.E2B_DOMAIN = "test.example";
  try {
    const result = await executeRun(
      new Service(db),
      owner,
      iteration,
      { command: "pwd" },
      "command",
      {
        create: async () => {
          throw new Error("url?apiKey=test-secret");
        },
      },
    );
    assert.equal(result.status, "failed");
    assert.ok(!result.output.includes("test-secret"));
    assert.equal(
      (await request(`/versions/${version1.id}`, undefined, owner)).status,
      200,
    );
  } finally {
    for (const [key, value] of [
      ["E2B_API_KEY", saved.key],
      ["E2B_DOMAIN", saved.domain],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("archival is immutable, includes exact reviewed versions, and survives a fresh database connection", async () => {
  const archived = await request(
    `/threads/${iteration}/archive`,
    { conclusion: "Accepted version one" },
    owner,
  );
  assert.equal(archived.status, 200);
  assert.ok(
    archived.body.versions.some(
      (v) => v.id === version1.id && v.reviews[0].decision === "approved",
    ),
  );
  assert.equal(
    (
      await request(
        `/threads/${iteration}/messages`,
        { body: "Too late" },
        owner,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/versions/${version1.id}/reviews`,
        { decision: "changes_requested" },
        owner,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/threads/${iteration}/archive`,
        { conclusion: "Overwrite" },
        owner,
      )
    ).status,
    409,
  );
  const db2 = await createDatabase(database.url);
  try {
    const fresh = await new Service(db2).context(owner, iteration);
    assert.equal(fresh.archive_snapshot.conclusion, "Accepted version one");
    assert.ok(fresh.messages.length >= 6);
  } finally {
    await db2.end();
  }
  const next = await request(
    `/projects/${project}/threads`,
    { title: "Iteration 2" },
    owner,
  );
  assert.equal(next.status, 201);
  assert.equal(
    (
      await request(
        `/threads/${next.body.id}/messages`,
        { body: "Reuse approved version", refs: [version1.id] },
        owner,
      )
    ).status,
    201,
  );
});

test("a message racing archival is either included in the snapshot or rejected", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Archive race" },
    owner,
  );
  assert.equal(created.status, 201);
  const target = created.body.id;
  const [message, archive] = await Promise.all([
    request(`/threads/${target}/messages`, { body: "Racing message" }, owner),
    request(
      `/threads/${target}/archive`,
      { conclusion: "Frozen atomically" },
      owner,
    ),
  ]);
  assert.equal(archive.status, 200);
  assert.ok([201, 409].includes(message.status));
  assert.equal(
    archive.body.messages.some((m) => m.body === "Racing message"),
    message.status === 201,
  );
});

test("revoked account credentials stop working immediately", async () => {
  const token = await request(
    "/tokens",
    { projectId: project, label: "Disposable" },
    viewer,
  );
  assert.equal(
    (
      await request(`/projects/${project}`, undefined, {
        token: token.body.token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/tokens/${token.body.id}`, undefined, viewer, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (
      await request(`/projects/${project}`, undefined, {
        token: token.body.token,
      })
    ).status,
    401,
  );
});

test("a summary that cannot be committed is never marked successful", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Commit failure" },
    owner,
  );
  const service = new Service(db);
  service.insertMessage = async () => {
    throw new Error("Injected persistence failure");
  };
  const saved = Object.fromEntries(
    ["E2B_API_KEY", "E2B_DOMAIN", "DSH_ENABLED", "DSH_BOOTSTRAP"].map((key) => [
      key,
      process.env[key],
    ]),
  );
  Object.assign(process.env, {
    E2B_API_KEY: "test-key",
    E2B_DOMAIN: "test.example",
    DSH_ENABLED: "true",
    DSH_BOOTSTRAP: "false",
  });
  let released = false;
  try {
    const result = await executeRun(
      service,
      owner,
      created.body.id,
      {},
      "summary",
      {
        create: async () => ({
          sandboxId: "test-only",
          files: { makeDir: async () => {}, write: async () => {} },
          commands: {
            run: async () => ({ exitCode: 0, stdout: "A summary", stderr: "" }),
          },
          kill: async () => {
            released = true;
          },
        }),
      },
    );
    assert.equal(result.status, "failed");
    assert.equal(released, true);
    const [record] = await query(
      db,
      "SELECT status FROM sandbox_runs WHERE id=?",
      [result.id],
    );
    assert.equal(record.status, "failed");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a human message queues exactly one durable assistant reply and AI messages do not loop", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Assistant conversation" },
    owner,
  );
  const threadId = created.body.id;
  const members = (await request(`/projects/${project}`, undefined, owner)).body
    .members;
  assert.equal(
    members.filter((m) => m.id === "agent-assistant" && m.name === "小祥")
      .length,
    1,
  );
  const sent = await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 你好", autoReply: false },
    owner,
  );
  const waiting = await request(`/threads/${threadId}`, undefined, owner);
  assert.equal(waiting.body.replies[0].status, "queued");
  const later = await request(
    `/threads/${threadId}/messages`,
    { body: "later context should not leak backwards" },
    owner,
  );
  assert.equal(later.status, 201);
  await processNextReply(db, async (context) => {
    assert.equal(context.messages.at(-1).body, "@Agent助手 你好");
    return "你好！我是共序助手。";
  });
  const replied = await request(`/threads/${threadId}`, undefined, owner);
  assert.equal(replied.body.replies[0].status, "completed");
  assert.equal(
    replied.body.messages.filter((m) => m.source === "assistant").length,
    1,
  );
  let decisions = 0;
  assert.equal(
    await processNextReply(
      db,
      async () => {
        throw new Error("Silent observation must not execute Agent");
      },
      async (context) => {
        decisions++;
        assert.equal(
          context.messages.at(-1).body,
          "later context should not leak backwards",
        );
        return false;
      },
    ),
    true,
  );
  assert.equal(decisions, 1);
  const observed = (await request(`/threads/${threadId}`, undefined, owner))
    .body;
  assert.equal(observed.replies[1].participation, "silent");
  assert.equal(observed.replies[1].reply_id, null);
  assert.equal(
    observed.messages.filter((m) => m.source === "assistant").length,
    1,
  );

  assert.equal(
    (
      await request(
        `/threads/${threadId}/messages`,
        { body: "local AI", autoReply: true },
        { token: apiToken },
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await query(
        db,
        "SELECT COUNT(*) count FROM assistant_replies WHERE message_id=?",
        [sent.body.id],
      )
    )[0].count,
    "1",
  );
  assert.equal(
    await processNextReply(db, async () => {
      throw new Error("AI loop");
    }),
    false,
  );
});

test("summary shortcut and same-member additions share one task and execution record", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Separate Agent rounds" },
    owner,
  );
  const threadId = created.body.id;
  const first = await request(`/threads/${threadId}/summary`, {}, owner);
  const second = await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 补充下一步" },
    owner,
  );
  assert.equal(first.status, 202);
  assert.equal(first.body.status, "queued");
  assert.equal(second.body.updatedTaskId, first.body.id);
  for (const trigger of [first.body.id]) {
    await processNextReply(db, async (context, { job }) => {
      assert.equal(job.message_id, trigger);
      assert.match(context.messages.at(-1).body, /^@(?:小祥|Agent助手) /);
      await query(
        db,
        "INSERT INTO agent_events(message_id,tool,status,input) VALUES(?,'thinking','completed','{}')",
        [trigger],
      );
      return `本轮回复 ${trigger}`;
    });
  }
  const context = (await request(`/threads/${threadId}`, undefined, owner))
    .body;
  assert.equal(context.replies.length, 1);
  assert.equal(context.updates[0].message_id, second.body.id);
  assert.ok(context.updates[0].delivered_at);
  for (const reply of context.replies) {
    assert.equal(reply.status, "completed");
    assert.equal(
      context.messages.find((m) => m.id === reply.reply_id).body,
      `本轮回复 ${reply.message_id}`,
    );
    assert.equal(
      context.events.filter((event) => event.message_id === reply.message_id)
        .length,
      1,
    );
  }
});

test("a lone project member gets direct replies without mentions; adding a silent member restores participation decisions", async () => {
  const created = await request(
    "/projects",
    { name: "Direct Agent conversation" },
    owner,
  );
  assert.equal(created.status, 201);
  const projectId = created.body.id;
  projectIds.push(projectId);
  const thread = await request(
    `/projects/${projectId}/threads`,
    { title: "Direct conversation" },
    owner,
  );
  const threadId = thread.body.id;
  const sent = await request(
    `/threads/${threadId}/messages`,
    { body: "你好", autoReply: false },
    owner,
  );
  assert.equal(sent.status, 201);
  let context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(context.replies[0].participation, "reply");
  let executions = 0;
  await processNextReply(
    db,
    async (context) => {
      executions++;
      assert.equal(context.messages.at(-1).body, "你好");
      return "你好，有什么可以帮你？";
    },
    async () => {
      throw new Error("A direct conversation must not choose silence");
    },
  );
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(executions, 1);
  assert.equal(context.replies[0].status, "completed");
  assert.ok(context.replies[0].reply_id);

  const joined = await request(
    `/projects/${projectId}/members`,
    { userId: outsider.id, role: "member" },
    owner,
  );
  assert.equal(joined.status, 201);
  await request(
    `/threads/${threadId}/messages`,
    { body: "我再补充一点" },
    owner,
  );
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(context.replies[1].participation, "pending");
  await processNextReply(
    db,
    async () => {
      throw new Error("Silent observation must not reply");
    },
    async () => false,
  );
  await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 请回答" },
    owner,
  );
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(context.replies[2].participation, "reply");
  await processNextReply(
    db,
    async () => "收到",
    async () => {
      throw new Error("Mentions must bypass silence");
    },
  );
});

test("unmentioned messages can prompt participation and cancellation prevents execution", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Participation decisions" },
    owner,
  );
  const threadId = created.body.id;
  await request(
    `/threads/${threadId}/messages`,
    { body: "谁能帮忙澄清这个问题？" },
    owner,
  );
  let executions = 0;
  await processNextReply(
    db,
    async () => {
      executions++;
      return "我可以补充一个思路。";
    },
    async () => true,
  );
  let context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(executions, 1);
  assert.equal(context.replies[0].participation, "reply");
  assert.ok(context.replies[0].reply_id);
  const next = await request(
    `/threads/${threadId}/messages`,
    { body: "进一步讨论" },
    owner,
  );
  await processNextReply(
    db,
    async () => {
      throw new Error("Cancelled observation must not execute");
    },
    async () => {
      await query(
        db,
        "UPDATE assistant_replies SET status='cancelled' WHERE message_id=?",
        [next.body.id],
      );
      return true;
    },
  );
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(
    context.messages.filter((m) => m.source === "assistant").length,
    1,
  );
  assert.equal(context.replies[1].status, "cancelled");
});

test("native context checkpoint and live usage track each message once across reloads", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Durable native context" },
    owner,
  );
  const threadId = created.body.id;
  const service = new Service(db);
  let runtime;
  try {
    const first = await service.postMessage(owner, threadId, {
      body: "记住会话代号：ALPHA",
    });
    let context = await service.context(owner, threadId);
    runtime = await openAgentRuntime(context, {
      db,
      user: owner,
      job: { thread_id: threadId },
      autoCompact: false,
    });
    const retained = JSON.stringify(await runtime.request("history"));
    assert.ok(retained.includes(first.id));
    context = await service.context(owner, threadId);
    assert.equal(
      context.contextUsage.categories.find((c) => c.key === "pending").tokens,
      0,
      "live metering must not count newly admitted messages twice",
    );
    const initial = context.contextUsage.used;
    await runtime.close(true);
    runtime = undefined;
    const [stored] = await query(
      db,
      "SELECT checkpoint,seen_sequence FROM agent_sessions WHERE thread_id=?",
      [threadId],
    );
    assert.ok(stored.checkpoint.length > 0);
    const next = await service.postMessage(owner, threadId, {
      body: "第二条消息",
    });
    context = await service.context(owner, threadId);
    assert.ok(context.contextUsage.used > initial);
    runtime = await openAgentRuntime(context, {
      db,
      user: owner,
      job: { thread_id: threadId },
      autoCompact: false,
    });
    const history = JSON.stringify(await runtime.request("history"));
    assert.equal(history.split(first.id).length - 1, 1);
    assert.equal(history.split(next.id).length - 1, 1);
    await runtime.close(true);
    runtime = undefined;
    context = await service.context(owner, threadId);
    assert.equal(context.messages.length, 2);
    assert.equal(
      context.contextUsage.categories.find((c) => c.key === "pending").tokens,
      0,
    );
  } finally {
    if (runtime) await runtime.close();
    const directory = resolve(".local/agents", threadId);
    assert.equal(
      directory,
      resolve(".local/agents") +
        (process.platform === "win32" ? "\\" : "/") +
        threadId,
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("context compression is scoped, durable, retryable, and preserves discussion", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Context management" },
    owner,
  );
  const threadId = created.body.id;
  const other = await request(
    `/projects/${project}/threads`,
    { title: "Independent context" },
    owner,
  );
  await request(
    `/threads/${threadId}/messages`,
    { body: "保留这个决定与聊天记录" },
    owner,
  );
  let context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.ok(context.contextUsage.used > 0);
  assert.equal(context.contextUsage.limit, 1000000);
  assert.equal(context.contextUsage.autoCompactAt, 900000);
  assert.equal(
    (await request(`/threads/${other.body.id}`, undefined, owner)).body
      .contextUsage.used,
    0,
  );
  for (const credential of [viewer, outsider, { token: apiToken }])
    assert.equal(
      (await request(`/threads/${threadId}/context/compact`, {}, credential))
        .status,
      403,
    );
  const route = `/threads/${threadId}/context/compact`;
  assert.equal((await request(route, {}, owner)).status, 202);
  assert.equal((await request(route, {}, owner)).body.status, "queued");
  assert.equal(
    (await request(`/threads/${threadId}`, undefined, owner)).body.contextUsage
      .compactStatus,
    "queued",
  );
  await processNextContextCompression(db, async () => {
    throw new Error("injected private provider failure");
  });
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.equal(context.contextUsage.compactStatus, "failed");
  assert.ok(!context.contextUsage.compactError.includes("private"));
  await request(route, {}, owner);
  let persisted = false;
  await processNextContextCompression(db, async (context, options) => {
    assert.equal(options.job.thread_id, threadId);
    assert.equal(options.autoCompact, false);
    return {
      request: async (method) => {
        assert.equal(method, "compact");
        return { before: 50000, after: 2000, changed: true };
      },
      close: async () => {
        persisted = true;
      },
    };
  });
  context = (await request(`/threads/${threadId}`, undefined, owner)).body;
  assert.ok(persisted);
  assert.equal(context.contextUsage.compactStatus, "completed");
  assert.deepEqual(context.contextUsage.compactResult, {
    before: 50000,
    after: 2000,
    changed: true,
  });
  assert.equal(context.messages.length, 1);
  assert.equal(context.messages[0].body, "保留这个决定与聊天记录");
  assert.equal(
    (await request(`/threads/${other.body.id}`, undefined, owner)).body
      .contextUsage.compactStatus,
    "idle",
  );
  await request(
    `/threads/${threadId}/archive`,
    { conclusion: "保留历史" },
    owner,
  );
  assert.equal((await request(route, {}, owner)).status, 409);
});

test("reply failures are visible and retryable; archival cancels queued replies", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Reply recovery" },
    owner,
  );
  const threadId = created.body.id;
  const sent = await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 hello", autoReply: true },
    owner,
  );
  await processNextReply(db, async () => {
    throw new Error("secret-provider-error");
  });
  let context = await request(`/threads/${threadId}`, undefined, owner);
  assert.equal(context.body.replies[0].status, "failed");
  assert.ok(!context.body.replies[0].error.includes("secret"));
  await assert.rejects(
    retryReply(new Service(db), outsider, threadId, sent.body.id),
  );
  await retryReply(new Service(db), owner, threadId, sent.body.id);
  await processNextReply(db, async () => "恢复成功");
  assert.equal(
    (await request(`/threads/${threadId}`, undefined, owner)).body.replies[0]
      .status,
    "completed",
  );
  await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 pending", autoReply: true },
    owner,
  );
  assert.equal(
    (
      await request(
        `/threads/${threadId}/archive`,
        { conclusion: "End" },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    await processNextReply(db, async () => {
      throw new Error("Archived work must not run");
    }),
    false,
  );
});

test("Agent tools enforce project scope, record failures, and stop after cancellation", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Agent tool boundary" },
    owner,
  );
  const threadId = created.body.id;
  const sent = await request(
    `/threads/${threadId}/messages`,
    { body: "@Agent助手 agent test", autoReply: true },
    owner,
  );
  await query(
    db,
    "UPDATE assistant_replies SET status='running' WHERE message_id=?",
    [sent.body.id],
  );
  const job = { message_id: sent.body.id, thread_id: threadId };
  const service = new Service(db);
  const sandbox = {
    commands: {
      run: async () => {
        const e = new Error("nonzero");
        e.exitCode = 1;
        e.stderr = "assertion failed";
        throw e;
      },
    },
  };
  const tools = createAgentTools(service, owner, job, {
    getSandbox: async () => sandbox,
  });
  assert.equal((await tools("project_context", {})).id, project);
  const output = await tools("sandbox_command", {
    command: "python failing.py",
  });
  assert.equal(output.exitCode, 1);
  assert.equal(output.stderr, "assertion failed");
  await assert.rejects(tools("host_shell", { command: "Get-Content .env" }));
  await assert.rejects(
    createAgentTools(service, viewer, job)("project_context", {}),
  );
  const other = await service.createThread(owner, projectIds[1], {
    title: "Other project",
  });
  await assert.rejects(
    tools("read_iteration", { threadId: other.id }),
    (e) => e.status === 403,
  );
  assert.equal(
    (
      await request(
        `/threads/${threadId}/archive`,
        { conclusion: "cannot archive running agent" },
        owner,
      )
    ).status,
    409,
  );
  await query(
    db,
    "UPDATE assistant_replies SET status='cancelled' WHERE message_id=?",
    [sent.body.id],
  );
  await assert.rejects(
    tools("sandbox_command", { command: "must not execute" }),
    (e) => e.status === 409,
  );
  const [event] = await query(
    db,
    "SELECT status,output FROM agent_events WHERE message_id=? AND tool='read_iteration'",
    [sent.body.id],
  );
  assert.equal(event.status, "failed");
  for (const path of [
    "../secrets",
    "/etc/passwd",
    "C:\\secret",
    ".",
    "a/../../b",
    "a//b",
  ])
    assert.throws(() => relativePath(path));
  assert.equal(relativePath("src/hello.py"), "src/hello.py");
});

test("Agent publishing persists immutable versions idempotently and cannot claim human approval", async () => {
  const service = new Service(db);
  const thread = await service.createThread(owner, project, {
    title: "Agent export safety",
  });
  const sent = await service.postMessage(owner, thread.id, {
    body: "@Agent助手 Generate a document",
    autoReply: true,
  });
  await query(
    db,
    "UPDATE assistant_replies SET status='running' WHERE message_id=?",
    [sent.id],
  );
  const actor = { ...owner, kind: "agent" };
  const exportKey = "a".repeat(64);
  const data = {
    title: "Generated code",
    filename: "example.py",
    mime: "text/plain",
    contentBase64: Buffer.from("print(2+3)").toString("base64"),
  };
  const first = await service.submitVersion(
    actor,
    thread.id,
    data,
    exportKey,
    sent.id,
  );
  const again = await service.submitVersion(
    actor,
    thread.id,
    data,
    exportKey,
    sent.id,
  );
  assert.equal(first.id, again.id);
  assert.equal(again.reused, true);
  const context = await service.context(owner, thread.id);
  assert.equal(context.messages.at(-1).source, "assistant");
  await assert.rejects(
    service.review(actor, first.id, { decision: "approved" }),
    (e) => e.status === 403,
  );
  await query(
    db,
    "UPDATE assistant_replies SET status='cancelled' WHERE message_id=?",
    [sent.id],
  );
  await assert.rejects(
    service.submitVersion(actor, thread.id, data, "b".repeat(64), sent.id),
    (e) => e.status === 409,
  );
  assert.equal(
    (await service.version(owner, first.id)).content.toString(),
    "print(2+3)",
  );
});

test("document tree permissions, nesting, soft deletion, and immutable historical references", async () => {
  const rootPath = `/projects/${project}`;
  const folder = await request(rootPath + "/folders", { name: "资料" }, owner);
  assert.equal(folder.status, 201);
  const child = await request(
    rootPath + "/folders",
    { name: "需求", parentId: folder.body.id },
    owner,
  );
  assert.equal(child.status, 201);
  assert.equal(
    (await request(rootPath + "/folders", { name: "资料" }, owner)).status,
    409,
  );
  assert.equal(
    (await request(rootPath + "/folders", { name: "无权创建" }, viewer)).status,
    403,
  );
  assert.equal(
    (await request(rootPath + "/folders", { name: "无权读取" }, outsider))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        rootPath + `/folders/${folder.body.id}`,
        { parentId: child.body.id },
        owner,
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        rootPath + `/folders/${folder.body.id}`,
        {},
        owner,
        "DELETE",
      )
    ).status,
    409,
  );
  const t = await request(
    rootPath + "/threads",
    { title: "文件树测试" },
    owner,
  );
  const file = await request(
    `/threads/${t.body.id}/versions`,
    {
      title: "说明",
      filename: "说明.md",
      mime: "text/markdown",
      contentBase64: Buffer.from("# 原始内容").toString("base64"),
      folderId: child.body.id,
    },
    owner,
  );
  assert.equal(file.status, 201);
  const path = rootPath + `/artifacts/${file.body.artifactId}`;
  assert.equal(
    (await request(path, { name: "改名" }, viewer, "PATCH")).status,
    403,
  );
  assert.equal(
    (await request(path, { folderId: randomUUID() }, owner, "PATCH")).status,
    404,
  );
  assert.equal(
    (
      await request(
        path,
        { name: "使用说明", folderId: folder.body.id },
        owner,
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(path, { deleted: true }, owner, "PATCH")).status,
    200,
  );
  const old = await request(`/versions/${file.body.id}`, undefined, owner);
  assert.equal(old.status, 200);
  assert.equal(
    Buffer.from(old.body.contentBase64, "base64").toString(),
    "# 原始内容",
  );
  assert.equal(old.body.filename, "说明.md");
  assert.equal(
    (
      await request(
        `/threads/${t.body.id}/versions`,
        {
          artifactId: file.body.artifactId,
          title: "覆盖",
          filename: "a.txt",
          contentBase64: "",
        },
        owner,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(path, { deleted: false }, owner, "PATCH")).status,
    200,
  );
  const d = await request(rootPath, undefined, owner);
  const v = d.body.versions.find((v) => v.id === file.body.id);
  assert.equal(v.title, "使用说明");
  assert.equal(v.folder_id, folder.body.id);
  assert.equal(v.deleted_at, null);
  assert.equal(
    (await request(rootPath + `/folders/${child.body.id}`, {}, owner, "DELETE"))
      .status,
    200,
  );
});

test("global accounts join multiple projects without resetting credentials or inheriting access", async () => {
  assert.equal((await request("/users")).status, 401);
  assert.equal(
    (await request("/users", undefined, { token: apiToken })).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/users",
        { name: "Forbidden", email: "forbidden@example.com", password },
        viewer,
      )
    ).status,
    403,
  );
  const email = `shared-${randomUUID()}@example.com`;
  const created = await request(
    "/users",
    { name: "Shared account", email, password },
    owner,
  );
  assert.equal(created.status, 201);
  userIds.push(created.body.id);
  assert.equal(
    (await request("/users", { name: "Duplicate", email, password }, owner))
      .status,
    409,
  );
  const signed = await request("/login", { email, password });
  assert.equal(signed.status, 200);
  assert.deepEqual((await request("/projects", undefined, signed)).body, []);
  const directory = await request("/users", undefined, signed);
  assert.equal(directory.status, 200);
  assert.deepEqual(
    Object.keys(directory.body.find((u) => u.id === created.body.id)).sort(),
    ["avatar", "email", "id", "identity_tags", "motto", "name"],
  );
  assert.equal(
    (
      await request(
        `/projects/${project}/members`,
        { userId: created.body.id, role: "member" },
        signed,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${project}/members`,
        { userId: created.body.id, role: "viewer" },
        owner,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/projects/${project}/members`,
        { userId: created.body.id },
        owner,
      )
    ).status,
    409,
  );
  const second = await request(
    "/projects",
    { name: "Second membership" },
    owner,
  );
  projectIds.push(second.body.id);
  assert.equal(
    (await request(`/projects/${second.body.id}`, undefined, signed)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${second.body.id}/members`,
        { userId: created.body.id, role: "member" },
        owner,
      )
    ).status,
    201,
  );
  const again = await request("/login", { email, password });
  assert.equal(again.status, 200);
  const joined = (await request("/projects", undefined, again)).body;
  assert.equal(joined.length, 2);
  assert.equal(joined.find((p) => p.id === project).role, "viewer");
  assert.equal(joined.find((p) => p.id === second.body.id).role, "member");
});

test("iteration directory includes creator and activity from subsequent discussion", async () => {
  const created = await request(
    `/projects/${project}/threads`,
    { title: "Activity metadata" },
    owner,
  );
  assert.equal(created.status, 201);
  await query(
    db,
    "UPDATE threads SET created_at='2000-01-01 00:00:00' WHERE id=?",
    [created.body.id],
  );
  const message = await request(
    `/threads/${created.body.id}/messages`,
    { body: "Activity update", autoReply: false },
    owner,
  );
  assert.equal(message.status, 201);
  const detail = await request(`/projects/${project}`, undefined, owner);
  const item = detail.body.threads.find((t) => t.id === created.body.id);
  assert.equal(item.created_by, owner.id);
  assert.ok(item.creator);
  assert.ok(item.last_active_at > item.created_at);
});

test("chat attachments persist privately until sent and the system folder only permits moving out", async () => {
  const detail = (await request(`/projects/${project}`, undefined, owner)).body;
  const folder = detail.folders.find((f) => f.system_key === "chat_uploads");
  assert.equal(folder.name, "对话临时文件");
  assert.equal(folder.parent_id, null);
  const folderPath = `/projects/${project}/folders/${folder.id}`;
  for (const [data, method] of [
    [{ name: "Changed" }, "PATCH"],
    [{}, "DELETE"],
  ])
    assert.equal((await request(folderPath, data, owner, method)).status, 403);
  assert.equal(
    (
      await request(
        `/projects/${project}/folders`,
        { name: "Forbidden", parentId: folder.id },
        owner,
      )
    ).status,
    403,
  );
  const thread = (
    await request(
      `/projects/${project}/threads`,
      { title: "Chat uploads" },
      owner,
    )
  ).body.id;
  const payload = {
    title: "附件.md",
    filename: "附件.md",
    mime: "text/markdown",
    contentBase64: Buffer.from("# persisted attachment").toString("base64"),
  };
  assert.equal(
    (await request(`/threads/${thread}/attachments`, payload, viewer)).status,
    403,
  );
  assert.equal(
    (await request(`/threads/${thread}/attachments`, payload, outsider)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/threads/${thread}/versions`,
        { ...payload, folderId: folder.id },
        owner,
      )
    ).status,
    403,
  );
  const uploaded = await request(
    `/threads/${thread}/attachments`,
    payload,
    owner,
  );
  assert.equal(uploaded.status, 201);
  const version = uploaded.body;
  assert.equal(
    (await request(`/threads/${thread}`, undefined, owner)).body.messages
      .length,
    0,
  );
  const saved = (await request(`/versions/${version.id}`, undefined, owner))
    .body;
  assert.equal(saved.contentBase64, payload.contentBase64);
  const refreshed = (await request(`/projects/${project}`, undefined, owner))
    .body;
  assert.equal(
    refreshed.versions.find((v) => v.id === version.id).folder_id,
    folder.id,
  );
  const artifactPath = `/projects/${project}/artifacts/${version.artifactId}`;
  assert.equal(
    (await request(artifactPath, { folderId: null }, owner, "PATCH")).status,
    200,
  );
  assert.equal(
    (await request(artifactPath, { folderId: folder.id }, owner, "PATCH"))
      .status,
    403,
  );
  const ordinary = (
    await request(
      `/projects/${project}/folders`,
      { name: "Chat upload destination" },
      owner,
    )
  ).body.id;
  assert.equal(
    (await request(artifactPath, { folderId: ordinary }, owner, "PATCH"))
      .status,
    200,
  );
  assert.equal(
    (await request(folderPath, { parentId: ordinary }, owner, "PATCH")).status,
    403,
  );
  const sent = await request(
    `/threads/${thread}/messages`,
    { body: "/附件.md 请查看", refs: [version.id], autoReply: false },
    owner,
  );
  assert.equal(sent.status, 201);
  assert.deepEqual(
    (await request(`/threads/${thread}`, undefined, owner)).body.messages[0]
      .refs,
    [version.id],
  );
  assert.equal(
    (await request(artifactPath, { deleted: true }, owner, "PATCH")).status,
    200,
  );
  assert.equal(
    (await request(`/versions/${version.id}`, undefined, owner)).body
      .contentBase64,
    payload.contentBase64,
  );
  await request(
    `/threads/${thread}/archive`,
    { conclusion: "Upload verified" },
    owner,
  );
  assert.equal(
    (await request(`/threads/${thread}/attachments`, payload, owner)).status,
    409,
  );
});
