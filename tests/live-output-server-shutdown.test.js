import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { setImmediate as turn } from "node:timers/promises";
import { streamLiveOutput, stopLiveOutputStreams } from "../server/agent-live-output.js";
import { createShutdown } from "../server/shutdown.js";

test("HTTP shutdown ends SSE immediately but holds resources until its query drains", async () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const responseClosed = Promise.withResolvers();
  let queryFinished = false;
  let resourcesClosed = false;
  const db = {
    async execute() {
      entered.resolve();
      await release.promise;
      queryFinished = true;
      return [[]];
    },
  };
  const service = { db, async thread() {} };
  const server = http.createServer((req, res) => {
    req.query = {};
    void streamLiveOutput(service, {}, "shutdown", req, res).catch((error) => {
      res.statusCode = 500;
      res.end(error.message);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = http.get(`http://127.0.0.1:${server.address().port}`, (res) => {
    res.on("end", responseClosed.resolve);
    res.resume();
  });
  request.on("error", () => {});
  const shutdown = createShutdown({
    closeServer() {
      const closed = new Promise((resolve) => server.close(resolve));
      const streamsClosed = stopLiveOutputStreams(db).then(() => server.closeIdleConnections());
      return Promise.all([closed, streamsClosed]);
    },
    stopWorker() {},
    closeResources() {
      assert.equal(queryFinished, true);
      resourcesClosed = true;
    },
    timeoutMs: 2000,
    onError(error) {
      assert.fail(error.message);
    },
    exit(code) {
      assert.equal(code, 0);
    },
  });
  try {
    await entered.promise;
    const stopped = shutdown();
    await responseClosed.promise;
    await turn();
    assert.equal(queryFinished, false);
    assert.equal(resourcesClosed, false, "HTTP closed alone is insufficient to close the pool");
    release.resolve();
    assert.equal(await stopped, 0);
    assert.equal(resourcesClosed, true);
  } finally {
    release.resolve();
    request.destroy();
    await stopLiveOutputStreams(db);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("disconnecting the SSE client does not hide its pending query from shutdown", async () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const clientClosed = Promise.withResolvers();
  const db = {
    async execute() {
      entered.resolve();
      await release.promise;
      return [[]];
    },
  };
  const service = { db, async thread() {} };
  const server = http.createServer((req, res) => {
    req.query = {};
    res.once("close", clientClosed.resolve);
    void streamLiveOutput(service, {}, "disconnect", req, res).catch(() => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const received = Promise.withResolvers();
  const request = http.get(`http://127.0.0.1:${server.address().port}`, received.resolve);
  request.on("error", () => {});
  try {
    const response = await received.promise;
    await entered.promise;
    response.destroy();
    await clientClosed.promise;
    let drained = false;
    const stopping = stopLiveOutputStreams(db);
    stopping.then(() => {
      drained = true;
    });
    await turn();
    assert.equal(drained, false);
    release.resolve();
    await stopping;
    assert.equal(drained, true);
  } finally {
    release.resolve();
    request.destroy();
    await stopLiveOutputStreams(db);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a client disconnected during authorization never starts a snapshot or subscription", async () => {
  const entered = Promise.withResolvers();
  const authorize = Promise.withResolvers();
  const clientClosed = Promise.withResolvers();
  let queries = 0;
  const db = {
    async execute() {
      queries++;
      return [[]];
    },
  };
  const service = {
    db,
    async thread() {
      entered.resolve();
      await authorize.promise;
    },
  };
  const server = http.createServer((req, res) => {
    req.query = {};
    res.once("close", clientClosed.resolve);
    void streamLiveOutput(service, {}, "late-auth", req, res).catch(() => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = http.get(`http://127.0.0.1:${server.address().port}`);
  request.on("error", () => {});
  try {
    await entered.promise;
    request.destroy();
    await clientClosed.promise;
    authorize.resolve();
    await turn();
    await turn();
    assert.equal(queries, 0);
  } finally {
    authorize.resolve();
    request.destroy();
    await stopLiveOutputStreams(db);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
