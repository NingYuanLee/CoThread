import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { setImmediate as turn } from "node:timers/promises";
import { digest } from "../server/auth.js";
import { registerDevServerUpgrade } from "../server/miniprogram-dev-server.js";

async function harness({ select, touch, credential, member } = {}) {
  const projectId = randomUUID(),
    id = randomUUID();
  const peers = new Set(),
    clients = new Set();
  const peerReady = Promise.withResolvers(),
    peerClosed = Promise.withResolvers();
  const clientClosed = Promise.withResolvers();
  const upstream = http.createServer();
  let upgrades = 0,
    selects = 0,
    touches = 0;
  upstream.on("upgrade", (_req, socket, head) => {
    upgrades++;
    peers.add(socket);
    socket.on("error", () => {});
    socket.once("close", peerClosed.resolve);
    socket.on("end", () => socket.end());
    socket.on("data", (data) => socket.write(data));
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
    if (head.length) socket.write(head);
    peerReady.resolve(socket);
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const db = {
    async execute(sql) {
      if (sql.includes("FROM credentials c JOIN users")) {
        await credential?.();
        return [[{ id: "user", kind: "session" }]];
      }
      if (sql.includes("SELECT m.role FROM members")) {
        member?.();
        return [[{ role: "owner" }]];
      }
      if (sql.includes("SELECT id,project_id,port,status,token_hash")) {
        selects++;
        await select?.();
        return [
          [
            {
              id,
              project_id: projectId,
              port: upstream.address().port,
              status: "running",
              token_hash: digest("valid"),
            },
          ],
        ];
      }
      assert.match(sql, /^UPDATE miniprogram_dev_servers/);
      touches++;
      await touch?.();
      return [{ affectedRows: 1 }];
    },
  };
  const server = http.createServer();
  server.on("connection", (socket) => socket.once("close", clientClosed.resolve));
  const stop = registerDevServerUpgrade(server, db);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    stop,
    peerReady: peerReady.promise,
    peerClosed: peerClosed.promise,
    clientClosed: clientClosed.promise,
    get counts() {
      return { selects, touches, upgrades };
    },
    connect(token = "valid", cookie = "") {
      const client = net.connect(server.address().port, "127.0.0.1");
      clients.add(client);
      client.on("error", () => {});
      const response = new Promise((resolve) => client.once("data", resolve));
      const closed = new Promise((resolve) => client.once("close", resolve));
      client.resume();
      client.write(
        `GET /api/projects/${projectId}/miniprogram/dev-servers/${id}/proxy/?token=${token} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${cookie ? `Cookie: ${cookie}\r\n` : ""}\r\n`,
      );
      return { client, response, closed };
    },
    async close() {
      for (const client of clients) client.destroy();
      await stop();
      for (const socket of peers) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => upstream.close(resolve));
    },
  };
}

test("stop waits for admitted lookup, rejects later upgrades and shares completion", async () => {
  const entered = Promise.withResolvers(),
    finish = Promise.withResolvers();
  const app = await harness({
    select: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  try {
    app.connect();
    await entered.promise;
    const stopping = app.stop();
    assert.equal(app.stop(), stopping);
    let done = false;
    stopping.then(() => {
      done = true;
    });
    await turn();
    assert.equal(done, false);
    const late = app.connect();
    await late.closed;
    assert.equal(app.counts.selects, 1);
    finish.resolve();
    await stopping;
    assert.deepEqual(app.counts, { selects: 1, touches: 0, upgrades: 0 });
  } finally {
    finish.resolve();
    await app.close();
  }
});

test("disconnect during lookup cannot start the next query or an upstream connection", async () => {
  const entered = Promise.withResolvers(),
    finish = Promise.withResolvers();
  const app = await harness({
    select: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  try {
    const { client } = app.connect();
    await entered.promise;
    client.destroy();
    await app.clientClosed;
    finish.resolve();
    // Do not stop until the admitted handler has had a chance to resume.
    for (let i = 0; i < 5; i++) await turn();
    assert.deepEqual(app.counts, { selects: 1, touches: 0, upgrades: 0 });
  } finally {
    finish.resolve();
    await app.close();
  }
});

test("stop also waits for the activity write and cannot connect after it resolves", async () => {
  const entered = Promise.withResolvers(),
    finish = Promise.withResolvers();
  const app = await harness({
    touch: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  try {
    app.connect();
    await entered.promise;
    const stopping = app.stop();
    let done = false;
    stopping.then(() => {
      done = true;
    });
    await turn();
    assert.equal(done, false);
    finish.resolve();
    await stopping;
    assert.deepEqual(app.counts, { selects: 1, touches: 1, upgrades: 0 });
  } finally {
    finish.resolve();
    await app.close();
  }
});

test("shutdown during cookie authentication skips the subsequent membership query", async () => {
  const entered = Promise.withResolvers(),
    finish = Promise.withResolvers();
  let memberQueries = 0;
  const app = await harness({
    credential: async () => {
      entered.resolve();
      await finish.promise;
    },
    member: () => {
      memberQueries++;
    },
  });
  try {
    app.connect("invalid", "cothread_session=session-value");
    await entered.promise;
    const stopping = app.stop();
    finish.resolve();
    await stopping;
    assert.equal(memberQueries, 0);
    assert.deepEqual(app.counts, { selects: 1, touches: 0, upgrades: 0 });
  } finally {
    finish.resolve();
    await app.close();
  }
});

test("either tunnel peer closing reclaims the other peer", async () => {
  for (const side of ["upstream", "client"]) {
    const app = await harness();
    try {
      const connection = app.connect();
      assert.match(String(await connection.response), /101 Switching/);
      const peer = await app.peerReady;
      if (side === "upstream") peer.end();
      else connection.client.destroy();
      await Promise.all([connection.closed, app.peerClosed]);
    } finally {
      await app.close();
    }
  }
});

test("unauthorized upgrades close without touching activity or upstream", async () => {
  const app = await harness();
  try {
    await app.connect("invalid").closed;
    assert.deepEqual(app.counts, { selects: 1, touches: 0, upgrades: 0 });
  } finally {
    await app.close();
  }
});

test("a valid session cookie still authorizes a project member", async () => {
  let memberQueries = 0;
  const app = await harness({
    member: () => {
      memberQueries++;
    },
  });
  try {
    const connection = app.connect("invalid", "cothread_session=session-value");
    assert.match(String(await connection.response), /101 Switching/);
    assert.equal(memberQueries, 1);
    assert.deepEqual(app.counts, { selects: 1, touches: 1, upgrades: 1 });
  } finally {
    await app.close();
  }
});

test("failed lookup or activity write closes the client and drains", async () => {
  for (const phase of ["select", "touch"]) {
    const app = await harness({
      [phase]: async () => {
        throw new Error("injected query failure");
      },
    });
    try {
      await app.connect().closed;
      await app.stop();
      assert.equal(app.counts.upgrades, 0);
    } finally {
      await app.close();
    }
  }
});

test("pending authorization buffers are bounded and remain part of the drain", async () => {
  const entered = Promise.withResolvers(),
    finish = Promise.withResolvers();
  const app = await harness({
    select: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  try {
    const connection = app.connect();
    await entered.promise;
    connection.client.write(Buffer.alloc(1024 * 1024 + 65536));
    await connection.closed;
    finish.resolve();
    await app.stop();
    assert.deepEqual(app.counts, { selects: 1, touches: 0, upgrades: 0 });
  } finally {
    finish.resolve();
    await app.close();
  }
});

test("stopping one upgrade registration leaves another server usable", async () => {
  const stopped = await harness(),
    active = await harness();
  try {
    await stopped.stop();
    await stopped.connect().closed;
    assert.equal(stopped.counts.selects, 0);
    const connection = active.connect();
    assert.match(String(await connection.response), /101 Switching/);
    assert.equal(active.counts.upgrades, 1);
  } finally {
    await stopped.close();
    await active.close();
  }
});
