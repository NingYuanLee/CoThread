import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";

test("pending chat reads preserve cursor precision, quotes and reply accounting", async () => {
  const database = await testDatabase(),
    db = database.db;
  try {
    const actor = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      actor.id,
      `${actor.id}@test.invalid`,
      "pending query",
    ]);
    const service = new Service(db),
      project = await service.createProject(actor, { name: "pending query" });
    const thread = await service.createThread(actor, project.id, { title: "pending" });
    const other = await service.createThread(actor, project.id, { title: "other" });
    const base = 9007199254740993n;
    const messages = Array.from({ length: 6 }, (_, i) => ({
      id: randomUUID(),
      sequence: String(base + BigInt(i)),
      source: i === 1 || i === 3 ? "assistant" : "human",
      body: `body ${i} 中文`,
    }));
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      await query(
        db,
        "INSERT INTO messages(id,sequence,thread_id,author_id,source,body,refs,folder_refs) VALUES(?,?,?,?,?,?,JSON_ARRAY(),JSON_ARRAY())",
        [m.id, m.sequence, i === 5 ? other.id : thread.id, actor.id, m.source, m.body],
      );
    }
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,reply_id) VALUES(?,'completed',?)",
      [messages[0].id, messages[1].id],
    );
    await query(
      db,
      "INSERT INTO assistant_replies(message_id,status,reply_id,parent_message_id) VALUES(?,'completed',?,?)",
      [messages[2].id, messages[3].id, messages[0].id],
    );
    await query(db, "INSERT INTO message_quotes(message_id,quoted_message_id) VALUES(?,?),(?,?)", [
      messages[4].id,
      messages[0].id,
      messages[4].id,
      messages[1].id,
    ]);
    const captured = [];
    const observed = {
      async execute(sql, params) {
        const result = await db.execute(sql, params);
        if (sql.includes("m.sequence>COALESCE")) captured.push(result[0].map((row) => row.id));
        return result;
      },
    };
    const reader = new Service(observed);
    const compare = async (seen) => {
      const full = await service.context(actor, thread.id);
      const visible = await reader.context(actor, thread.id, observed, { display: true });
      const delta = await reader.context(actor, thread.id, observed, {
        display: true,
        after: messages[4].sequence,
      });
      assert.deepEqual(visible.contextUsage, full.contextUsage);
      assert.deepEqual(delta.contextUsage, full.contextUsage);
      assert.deepEqual(visible.messages, full.messages);
      assert.deepEqual(delta.messages, []);
      const expected = messages
        .slice(0, 5)
        .filter((m) => BigInt(m.sequence) > seen)
        .map((m) => m.id)
        .sort();
      for (const ids of captured.splice(0)) assert.deepEqual(ids.sort(), expected);
      assert.ok(
        visible.messages.some((m) => m.id === messages[1].id),
        "visible native replies are retained",
      );
      assert.equal(visible.messages.find((m) => m.id === messages[4].id).quotes.length, 2);
      assert.ok(full.contextUsage.used > 0 || seen >= base + 4n);
    };
    await compare(0n); // No session.
    await query(
      db,
      "INSERT INTO agent_sessions(thread_id,session_id,seen_sequence) VALUES(?,?,0)",
      [thread.id, randomUUID()],
    );
    await compare(0n);
    for (const seen of [base, base + 1n, base + 4n]) {
      await query(db, "UPDATE agent_sessions SET seen_sequence=? WHERE thread_id=?", [
        String(seen),
        thread.id,
      ]);
      await compare(seen);
    }
  } finally {
    await database.close();
  }
});
