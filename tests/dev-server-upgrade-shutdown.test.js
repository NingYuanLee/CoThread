import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { setImmediate as turn } from "node:timers/promises";
import { setTimeout as delay } from "node:timers/promises";
import { digest } from "../server/auth.js";
import { registerDevServerUpgrade } from "../server/miniprogram-dev-server.js";
import { createShutdown } from "../server/shutdown.js";

test("shutdown reclaims upgraded tunnels while waiting for an ordinary HTTP response", async () => {
  const peers = new Set();
  const upstream = http.createServer();
  upstream.on("upgrade", (_req, socket) => {
    peers.add(socket);
    socket.on("error", () => {});
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const projectId = randomUUID(),
    id = randomUUID();
  const db = {
    async execute(sql) {
      return [
        sql.startsWith("SELECT")
          ? [
              {
                id,
                project_id: projectId,
                port: upstream.address().port,
                status: "running",
                token_hash: digest("test"),
              },
            ]
          : { affectedRows: 1 },
      ];
    },
  };
  const requestEntered = Promise.withResolvers();
  const finishRequest = Promise.withResolvers();
  const server = http.createServer(async (_req, res) => {
    requestEntered.resolve();
    await finishRequest.promise;
    res.end("saved");
  });
  const stopUpgrades = registerDevServerUpgrade(server, db);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = net.connect(server.address().port, "127.0.0.1");
  client.on("error", () => {});
  client.resume();
  const upgraded = new Promise((resolve) => client.once("data", resolve));
  const clientClosed = new Promise((resolve) => client.once("close", resolve));
  client.write(
    `GET /api/projects/${projectId}/miniprogram/dev-servers/${id}/proxy/?token=test HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
  );
  let request;
  try {
    assert.match(String(await upgraded), /101 Switching/);
    const response = new Promise((resolve, reject) => {
      request = http.get(
        { host: "127.0.0.1", port: server.address().port, path: "/save", agent: false },
        (res) => {
          let body = "";
          res.on("data", (data) => {
            body += data;
          });
          res.on("end", () => resolve(body));
        },
      );
      request.on("error", reject);
    });
    await requestEntered.promise;
    let resourcesClosed = false;
    const shutdown = createShutdown({
      stopWorker() {},
      closeServer() {
        const closed = new Promise((resolve) => server.close(resolve));
        return Promise.all([closed, stopUpgrades()]);
      },
      closeResources() {
        resourcesClosed = true;
      },
      timeoutMs: 2000,
      onError() {},
      exit() {},
    });
    const stopped = shutdown();
    await clientClosed;
    await turn();
    assert.equal(resourcesClosed, false);
    finishRequest.resolve();
    assert.equal(await response, "saved");
    assert.equal(await stopped, 0);
    assert.equal(resourcesClosed, true);
  } finally {
    finishRequest.resolve();
    request?.destroy();
    client.destroy();
    await stopUpgrades?.();
    for (const socket of peers) socket.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("upgrade preserves head and payload received while authorization is pending", async () => {
  const entered = Promise.withResolvers(),
    authorize = Promise.withResolvers();
  const projectId = randomUUID(),
    id = randomUUID();
  const peers = new Set();
  let payload = "";
  const upstream = http.createServer();
  upstream.on("upgrade", (_req, socket, head) => {
    peers.add(socket);
    socket.on("error", () => {});
    payload += head.toString();
    socket.on("data", (data) => {
      payload += data.toString();
    });
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const db = {
    async execute(sql) {
      if (sql.startsWith("SELECT")) {
        entered.resolve();
        await authorize.promise;
        return [
          [
            {
              id,
              project_id: projectId,
              port: upstream.address().port,
              status: "running",
              token_hash: digest("test"),
            },
          ],
        ];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const server = http.createServer();
  const stop = registerDevServerUpgrade(server, db);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = net.connect(server.address().port, "127.0.0.1");
  client.on("error", () => {});
  const ready = new Promise((resolve) => client.once("data", resolve));
  client.resume();
  try {
    client.write(
      `GET /api/projects/${projectId}/miniprogram/dev-servers/${id}/proxy/?token=test HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nHEAD`,
    );
    await entered.promise;
    client.write("EARLY");
    await delay(30);
    authorize.resolve();
    assert.match(String(await ready), /101 Switching/);
    client.write("LATE");
    for (let i = 0; i < 30 && !payload.endsWith("LATE"); i++) await delay(10);
    assert.equal(payload, "HEADEARLYLATE");
  } finally {
    authorize.resolve();
    client.destroy();
    await stop?.();
    for (const socket of peers) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  }
});
