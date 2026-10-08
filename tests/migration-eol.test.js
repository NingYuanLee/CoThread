import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { legacyMigrationChecksums, migrationChecksum, normalizeSqlEol } from "../scripts/migrate.js";

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
