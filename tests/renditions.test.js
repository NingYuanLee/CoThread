import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimRendition,
  completeRendition,
  failRendition,
  getRendition,
  RENDITION_MAX_ATTEMPTS,
} from "../server/documents/index.js";

/** 记录 SQL 的假连接：文档内核通过 query(db, sql, params) 执行。 */
function fakeDb(rows = []) {
  const statements = [];
  return {
    statements,
    execute: async (sql, params) => {
      statements.push({ sql: String(sql), params });
      return [rows, []];
    },
  };
}

test("派生记录读写走 version_renditions，且不会误用未带源哈希的查询", async () => {
  const row = { version_id: "v1", kind: "docx", status: "ready", source_sha256: "a".repeat(64) };
  const db = fakeDb([row]);
  assert.deepEqual(await getRendition(db, "v1"), row);
  assert.match(db.statements[0].sql, /FROM version_renditions/);
  assert.doesNotMatch(db.statements[0].sql, /\bcontent\b/);
  assert.deepEqual(db.statements[0].params, ["v1"]);

  await getRendition(db, "v1", { withContent: true });
  assert.match(db.statements[1].sql, /\bcontent\b/);
});

test("声明转换用 upsert 累计次数，并在源哈希变化时清空旧产物", async () => {
  const db = fakeDb([{ version_id: "v1", attempts: 1, source_sha256: "b".repeat(64) }]);
  const claimed = await claimRendition(db, {
    versionId: "v1",
    kind: "docx",
    sourceSha256: "b".repeat(64),
    filename: "a.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(claimed.attempts, 1);
  assert.match(db.statements[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.match(db.statements[0].sql, /source_sha256/);
  assert.equal(db.statements[0].params[0], "v1");
});

test("完成与失败都按版本和源哈希收敛，失败原因有长度上限", async () => {
  const db = fakeDb([]);
  await completeRendition(db, {
    versionId: "v1",
    sourceSha256: "c".repeat(64),
    content: Buffer.from("docx"),
    sha256: "d".repeat(64),
    byteSize: 4,
    filename: "a.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.match(db.statements[0].sql, /status='ready'/);
  assert.deepEqual(db.statements[0].params.slice(-2), ["v1", "c".repeat(64)]);

  await failRendition(db, {
    versionId: "v1",
    sourceSha256: "c".repeat(64),
    error: "x".repeat(600),
  });
  assert.match(db.statements[1].sql, /status='failed'/);
  assert.equal(db.statements[1].params[0].length, 500);
  assert.equal(RENDITION_MAX_ATTEMPTS, 3);
});
