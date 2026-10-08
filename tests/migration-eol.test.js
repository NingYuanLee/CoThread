import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  KNOWN_EQUIVALENT_REVISIONS,
  legacyMigrationChecksums,
  migrationChecksum,
  normalizeSqlEol,
} from "../scripts/migrate.js";

const SQL = "ALTER TABLE artifacts\n  ADD COLUMN foo CHAR(36) NULL;\n";

test("迁移 checksum 与检出时的行尾无关", () => {
  const lf = SQL;
  const crlf = SQL.replace(/\n/g, "\r\n");
  const cr = SQL.replace(/\n/g, "\r");
  assert.equal(migrationChecksum(lf), migrationChecksum(crlf));
  assert.equal(migrationChecksum(lf), migrationChecksum(cr));
  assert.equal(normalizeSqlEol(crlf), lf);
  assert.equal(normalizeSqlEol(cr), lf);
});

test("历史 CRLF 记录被识别为可重基线，正文改动仍判为变更", () => {
  const crlf = SQL.replace(/\n/g, "\r\n");
  const legacyRawCrlf = createHash("sha256").update(crlf, "utf8").digest("hex");
  const legacyRawLf = createHash("sha256").update(SQL, "utf8").digest("hex");

  assert.ok(legacyMigrationChecksums(SQL).has(legacyRawCrlf));
  assert.ok(legacyMigrationChecksums(SQL).has(legacyRawLf));
  assert.ok(legacyMigrationChecksums(crlf).has(legacyRawCrlf));

  // 正文真的改了：既不是当前 checksum，也不在任何历史候选里
  const changed = SQL.replace("foo", "bar");
  const changedRaw = createHash("sha256").update(changed, "utf8").digest("hex");
  assert.notEqual(migrationChecksum(changed), migrationChecksum(SQL));
  assert.ok(!legacyMigrationChecksums(SQL).has(changedRaw));
});

test("已登记的等价修订会被接受自动重基线，未登记的名字不受影响", () => {
  const sql = "SELECT 1;\n";
  for (const [name, hashes] of KNOWN_EQUIVALENT_REVISIONS) {
    assert.ok(hashes.length, `${name} 没有登记任何历史 checksum`);
    for (const hash of hashes) assert.ok(legacyMigrationChecksums(sql, name).has(hash));
    assert.ok(!legacyMigrationChecksums(sql, "000_unregistered.sql").has(hashes[0]));
    assert.ok(!legacyMigrationChecksums(sql).has(hashes[0]));
  }
});
