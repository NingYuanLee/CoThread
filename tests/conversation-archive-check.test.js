import { test } from "node:test";
import assert from "node:assert/strict";
import { scanArchivedConversation } from "../server/conversation-memory-store.ts";

test("归档补查只扫描一次，并先入队再保存扫描标记", async () => {
  let scanned = false;
  const calls = [];
  const db = {
    execute: async (sql) => {
      calls.push(sql);
      if (sql.includes("SELECT id,archived_at"))
        return [[{ id: "thread", archivedAt: "2026-11-03 00:00:00" }]];
      if (sql.includes("SELECT a.thread_id")) return [scanned ? [{ thread_id: "thread" }] : []];
      if (sql.includes("SELECT id FROM threads")) return [[{ id: "thread" }]];
      if (sql.includes("SELECT MIN(m.sequence)"))
        return [[{ firstSequence: null, lastSequence: null }]];
      if (sql.includes("INSERT INTO conversation_archive_checks")) {
        scanned = true;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    },
  };
  assert.equal(await scanArchivedConversation(db, "project", "thread"), true);
  const firstCount = calls.length;
  assert.ok(
    calls.findIndex((sql) => sql.includes("SELECT MIN(m.sequence)")) <
      calls.findIndex((sql) => sql.includes("INSERT INTO conversation_archive_checks")),
  );
  assert.equal(await scanArchivedConversation(db, "project", "thread"), false);
  assert.equal(calls.length - firstCount, 2);
});
