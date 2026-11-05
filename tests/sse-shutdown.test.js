import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { endSseStreams, sseStreamCount, trackSse } from "../server/sse-streams.ts";
import { createShutdown } from "../server/shutdown.js";

function fakeResponse() {
  return {
    writableEnded: false,
    ended: false,
    once() {},
    removeListener() {},
    end() {
      this.ended = true;
      this.writableEnded = true;
    },
  };
}

test("endSseStreams ends every tracked stream and is safe to repeat", () => {
  const first = fakeResponse();
  const second = fakeResponse();
  trackSse(first);
  trackSse(second);
  assert.equal(sseStreamCount(), 2);
  assert.equal(endSseStreams(), 2);
  assert.equal(first.ended, true);
  assert.equal(second.ended, true);
  assert.equal(sseStreamCount(), 0);
  assert.equal(endSseStreams(), 0);
});

test("a tracked SSE is ended by shutdown instead of holding the process open", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(": in\n\n");
    trackSse(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const clientClosed = new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${server.address().port}`, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    request.on("error", resolve);
  });
  while (sseStreamCount() === 0) await new Promise((resolve) => setTimeout(resolve, 10));

  const exitCodes = [];
  const shutdown = createShutdown({
    closeServer() {
      endSseStreams();
      const httpClosed = new Promise((resolve) => server.close(resolve));
      let timer;
      const connectionsClosed = new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          server.closeAllConnections();
          finish();
        }, 1000);
        httpClosed.then(finish, finish);
      });
      return Promise.all([httpClosed, connectionsClosed]);
    },
    stopWorker() {},
    closeResources() {},
    timeoutMs: 3000,
    exit(code) {
      exitCodes.push(code);
    },
  });

  const startedAt = Date.now();
  assert.equal(await shutdown(), 0);
  const elapsed = Date.now() - startedAt;
  await clientClosed;
  assert.ok(elapsed < 1500, `shutdown took ${elapsed}ms`);
  assert.equal(sseStreamCount(), 0);
  assert.deepEqual(exitCodes, [0]);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("an in-flight response that never ends is cut off by the grace window", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write("start");
    // 永不结束：模拟大下载或没有关闭钩子的长响应。
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = http.get(`http://127.0.0.1:${server.address().port}`);
  request.on("error", () => {});
  request.on("response", (res) => res.resume());
  while (!request.socket) await new Promise((resolve) => setTimeout(resolve, 10));

  const shutdown = createShutdown({
    closeServer() {
      endSseStreams();
      const httpClosed = new Promise((resolve) => server.close(resolve));
      let timer;
      const connectionsClosed = new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          server.closeAllConnections();
          finish();
        }, 200);
        httpClosed.then(finish, finish);
      });
      return Promise.all([httpClosed, connectionsClosed]);
    },
    stopWorker() {},
    closeResources() {},
    timeoutMs: 3000,
    exit() {},
  });

  const startedAt = Date.now();
  assert.equal(await shutdown(), 0);
  assert.ok(Date.now() - startedAt < 1000, "shutdown must not wait for the endless response");
  request.destroy();
  await new Promise((resolve) => server.close(resolve));
});
