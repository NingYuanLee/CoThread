import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { streamLiveOutput, stopLiveOutputStreams } from "../server/agent-live-output.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const row = {
  message_id: "m1",
  event_id: "1",
  run_id: "run",
  step: 1,
  reasoning: "",
  content: "hello",
  truncated: 0,
  revision: 1,
  status: "running",
  first_response_at: null,
};

function harness() {
  const state = {
    authCalls: 0,
    executeCalls: 0,
    auth: null,
    snapshot: null,
    errors: [],
  };
  const db = {
    async execute() {
      state.executeCalls += 1;
      if (state.snapshot) return [await state.snapshot()];
      return [[row]];
    },
  };
  const service = {
    db,
    async thread() {
      state.authCalls += 1;
      if (state.auth) await state.auth();
    },
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    req.query = Object.fromEntries(url.searchParams);
    res.json = (body) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    res.on("error", (error) => state.errors.push(error));
    Promise.resolve(
      streamLiveOutput(
        service,
        { id: "user" },
        url.searchParams.get("thread") || "thread-1",
        req,
        res,
      ),
    ).catch((error) => {
      if (!res.headersSent && !res.writableEnded) {
        res.statusCode = error.status || 500;
        res.end(error.message || "error");
      }
    });
  });
  return {
    state,
    db,
    service,
    async listen() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      state.base = `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      server.closeAllConnections?.();
      if (!server.listening) return;
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function settledSoon(promise) {
  let settled = false;
  promise.then(() => {
    settled = true;
  });
  await delay(40);
  return settled;
}

test("stop ends an active SSE stream and does not query again", async () => {
  const app = harness();
  await app.listen();
  try {
    const response = await fetch(`${app.state.base}/live`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (!body.includes("hello")) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      body += decoder.decode(chunk.value);
    }
    const started = Date.now();
    const drain = stopLiveOutputStreams(app.db);
    assert.equal(stopLiveOutputStreams(app.db), drain);
    await drain;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += decoder.decode(chunk.value);
    }
    assert.ok(Date.now() - started < 1000);
    const calls = app.state.executeCalls;
    await delay(1100);
    assert.equal(app.state.executeCalls, calls);
    assert.equal(app.state.errors.length, 0);
    assert.match(body, /hello/);
  } finally {
    await app.close();
  }
});

test("stop waits for an in-flight snapshot and a disconnected poll", async () => {
  const app = harness();
  const snapshot = deferred();
  let release;
  app.state.snapshot = () => {
    release = deferred();
    return release.promise;
  };
  await app.listen();
  try {
    const response = await fetch(`${app.state.base}/live?thread=sse`);
    const reader = response.body.getReader();
    const ready = await reader.read();
    assert.match(Buffer.from(ready.value).toString(), /ready/);
    assert.equal(app.state.executeCalls, 1);
    assert.ok(release);

    const pollSnapshot = deferred();
    const pollEntered = deferred();
    app.state.snapshot = () => {
      pollEntered.resolve();
      return pollSnapshot.promise;
    };
    const poll = http.get(`${app.state.base}/live?transport=poll&thread=poll`);
    poll.on("error", (error) => {
      if (error.code !== "ECONNRESET") app.state.errors.push(error);
    });
    await pollEntered.promise;
    poll.destroy();

    const drain = stopLiveOutputStreams(app.db);
    assert.equal(await settledSoon(drain), false);
    release.resolve([row]);
    assert.equal(await settledSoon(drain), false);
    pollSnapshot.resolve([row]);
    await drain;
    const rest = await reader.read();
    assert.equal(rest.done, true);
    assert.equal(app.state.errors.length, 0);
  } finally {
    await app.close();
  }
});

test("shutdown during auth skips the snapshot and later polls return 503", async () => {
  const app = harness();
  const auth = deferred();
  const entered = deferred();
  app.state.auth = () => {
    entered.resolve();
    return auth.promise;
  };
  await app.listen();
  try {
    const pending = fetch(`${app.state.base}/live?thread=late-auth`);
    await entered.promise;
    const drain = stopLiveOutputStreams(app.db);
    assert.equal(app.state.executeCalls, 0);
    assert.equal(await settledSoon(drain), false);
    auth.resolve();
    const response = await pending;
    assert.equal(response.status, 503);
    await drain;
    assert.equal(app.state.executeCalls, 0);

    const before = app.state.authCalls;
    const poll = await fetch(`${app.state.base}/live?transport=poll&thread=late-poll`);
    assert.equal(poll.status, 503);
    assert.equal(app.state.authCalls, before);
    assert.equal(app.state.executeCalls, 0);
    assert.equal(await poll.text(), "");
  } finally {
    await app.close();
  }
});

test("stopping one database leaves another database streaming", async () => {
  const stopped = harness();
  const live = harness();
  await stopped.listen();
  await live.listen();
  try {
    await stopLiveOutputStreams(stopped.db);
    const denied = await fetch(`${stopped.state.base}/live?transport=poll`);
    assert.equal(denied.status, 503);
    assert.equal(stopped.state.authCalls, 0);
    assert.equal(stopped.state.executeCalls, 0);

    const response = await fetch(`${live.state.base}/live`);
    const reader = response.body.getReader();
    const chunk = await reader.read();
    assert.match(Buffer.from(chunk.value).toString(), /ready/);
    assert.ok(live.state.authCalls >= 1);
    await stopLiveOutputStreams(live.db);
    await reader.read();
    assert.equal(stopped.state.executeCalls, 0);
  } finally {
    await stopped.close();
    await live.close();
  }
});

test("auth and snapshot failures leave shutdown able to finish", async () => {
  const authApp = harness();
  const auth = deferred();
  const entered = deferred();
  authApp.state.auth = () => {
    entered.resolve();
    return auth.promise;
  };
  await authApp.listen();
  try {
    const pending = fetch(`${authApp.state.base}/live?thread=auth-fail`);
    await entered.promise;
    const drain = stopLiveOutputStreams(authApp.db);
    auth.reject(new Error("denied"));
    await drain;
    assert.equal((await pending).status, 500);
    assert.equal(authApp.state.executeCalls, 0);
    await stopLiveOutputStreams(authApp.db);
  } finally {
    await authApp.close();
  }

  const snapApp = harness();
  const gate = deferred();
  const started = deferred();
  snapApp.state.snapshot = async () => {
    started.resolve();
    await gate.promise;
    throw new Error("snapshot failed");
  };
  await snapApp.listen();
  try {
    const pending = fetch(`${snapApp.state.base}/live?thread=snap-fail`);
    await started.promise;
    const drain = stopLiveOutputStreams(snapApp.db);
    assert.equal(await settledSoon(drain), false);
    const calls = snapApp.state.executeCalls;
    gate.resolve();
    await drain;
    const response = await pending;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /ready/);
    assert.equal(snapApp.state.executeCalls, calls);
    await stopLiveOutputStreams(snapApp.db);
  } finally {
    await snapApp.close();
  }
});
