import mysql from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
import { createDatabase } from "../server/db.ts";
import { resolveConfiguredTestDatabaseUrl } from "../server/database-policy.ts";
import { migrate, migrationChecksum } from "../scripts/migrate.js";

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

async function resetSchema(connection, name) {
  await connection.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    const [objects] = await connection.query(
      `SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=? ORDER BY TABLE_TYPE='VIEW' DESC,TABLE_NAME`,
      [name],
    );
    for (const object of objects) {
      // 归属地离线库体积大、与业务无关；同实例复用，避免每次集成测试清空重导。
      if (object.TABLE_NAME === "ip_geolocations") continue;
      const kind = object.TABLE_TYPE === "VIEW" ? "VIEW" : "TABLE";
      await connection.query(`DROP ${kind} IF EXISTS ${quoteIdentifier(object.TABLE_NAME)}`);
    }
    await connection.query(
      `ALTER DATABASE ${quoteIdentifier(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  }
}

async function resetData(connection, name) {
  const [objects] = await connection.query(
    `SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=? ORDER BY TABLE_TYPE='VIEW' DESC,TABLE_NAME`,
    [name],
  );
  const tables = objects.filter(
    (object) =>
      object.TABLE_TYPE !== "VIEW" &&
      object.TABLE_NAME !== "ip_geolocations" &&
      object.TABLE_NAME !== "schema_migrations",
  );
  // 逐表 TRUNCATE 是 DDL：104 张表每次重置会产生数千次同步落盘，全量套件里
  // 单次重置能从 4 s 恶化到 21 s。整包放进一个事务里 DELETE，落盘次数降两个数量级
  // （实测 3,775 → 68 次 fsync，20.5 s → 1.6 s）。users 的自增仍单独复位，
  // 其他表的自增不复位与 TRUNCATE 不同，测试不应依赖它们从 1 开始。
  await connection.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    await connection.beginTransaction();
    // Identifiers come only from this guarded test schema's metadata. Batch
    // deletes to avoid one network round trip per table on a remote test RDS.
    if (tables.length)
      await connection.query(
        tables.map((table) => `DELETE FROM ${quoteIdentifier(table.TABLE_NAME)}`).join(";"),
      );
    await connection.commit();
    await connection.query("ALTER TABLE `users` AUTO_INCREMENT=100001");
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  }
}

const PROTECTED_TEST_DATABASES = new Set(["cothread", "cothread_dev"]);
const MIGRATION_NAMES = new Set(
  (await readdir(new URL("../migrations/", import.meta.url))).filter((name) =>
    name.endsWith(".sql"),
  ),
);
const MIGRATION_CHECKSUMS = new Map(
  await Promise.all(
    [...MIGRATION_NAMES].map(async (name) => [
      name,
      migrationChecksum(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")),
    ]),
  ),
);

export async function testDatabase() {
  if (
    String(process.env.COTHREAD_DB_TARGET || "")
      .trim()
      .toLowerCase() === "prod"
  )
    throw new Error("集成测试拒绝使用 COTHREAD_DB_TARGET=prod，请将测试目标设置为 test。");
  let configured;
  try {
    configured = resolveConfiguredTestDatabaseUrl();
  } catch {
    configured = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  }
  if (!configured)
    throw new Error("集成测试需要测试库配置（TEST_DATABASE_HOST_*/dbname 与 TEST_DATABASE_AUTH）");
  const source = new URL(configured);
  const sourceDatabase = source.pathname.slice(1);
  if (PROTECTED_TEST_DATABASES.has(sourceDatabase.toLowerCase()))
    throw new Error(
      `集成测试不能清库 ${sourceDatabase}（日常开发库）。请配置 TEST_DATABASE_HOST_* + TEST_DATABASE_AUTH 指向独立测试库，例如 127.0.0.1:3307/cothread_test。`,
    );
  if (!/(?:^|_)(?:dev|test)(?:_|$)/i.test(sourceDatabase))
    throw new Error("集成测试数据库名称必须包含独立单词 dev 或 test");
  const password = decodeURIComponent(source.password);
  const ssl =
    process.env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_SSL_CA
            ? { ca: await readFile(process.env.DATABASE_SSL_CA, "utf8") }
            : {}),
        }
      : undefined;
  const control = await mysql.createConnection({
    multipleStatements: true,
    host: source.hostname,
    port: Number(source.port || 3306),
    user: decodeURIComponent(source.username),
    password,
    database: sourceDatabase,
    ssl,
  });
  const lockName = `cothread_test:${sourceDatabase}`.slice(0, 64);
  let locked = false;
  let db;
  try {
    const [[lock]] = await control.query("SELECT GET_LOCK(?,120) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error("等待测试库锁超时");
    locked = true;
    // information_schema 的表元数据默认缓存 24 小时（information_schema_stats_expiry），
    // 表被删或被重建后查到的仍是旧记录。后面「核心表是否还在」与「表的创建时间」
    // 两处判断都依赖实时元数据，这里先关掉缓存。
    try {
      await control.query("SET SESSION information_schema_stats_expiry = 0");
    } catch {
      // 低版本 MySQL 没有这个变量：退化成只靠「表是否还在」判断。
    }

    /**
     * 重置前必须确认「命名锁仍由本会话持有」。
     *
     * 锁是跨进程互斥的唯一依据：谁拿到锁谁才能改这个库。锁一旦丢失（本会话被
     * 服务端回收、或有别的进程绕过 testDatabase() 直接动这个库），再执行重置就会
     * 抹掉正在跑的另一个进程的数据——两边互为受害者。
     *
     * 这个洞已经咬过人：2026-11-06 `tests/agent-member-understanding.test.js` 在
     * 一次全量套件里偶发失败，症状是「刚写进去的 agent_member_summaries 行不见了」
     * 与「messages 的 sequence 倒着走」——只有一次并发 DROP+重建表能同时造成这两点。
     * 那次失败与被测代码无关：单独跑该文件 14 次全过、连续 5 轮全量套件也全过，
     * 只有在同一个库上同时跑第二套测试时出现过。
     */
    const assertLockHeld = async () => {
      const [[row]] = await control.query("SELECT IS_USED_LOCK(?) holder, CONNECTION_ID() me", [
        lockName,
      ]);
      if (Number(row?.holder) !== Number(row?.me))
        throw new Error(
          `测试库命名锁已丢失（持有者=${row?.holder ?? "无"} 本会话=${row?.me}）：` +
            "说明有另一个进程在并发使用同一个测试库，本轮断言结果不可信",
        );
    };

    let appliedMigrations = new Map();
    try {
      const [rows] = await control.query("SELECT name,checksum FROM schema_migrations");
      appliedMigrations = new Map(rows.map((row) => [row.name, row.checksum]));
    } catch {
      appliedMigrations = new Map();
    }
    /**
     * 除了迁移记录，还要确认核心表真的在。
     *
     * 只比对 `schema_migrations` 是不够的：表被别的手工操作删掉时，迁移记录照样齐全，
     * 框架会认为「schema 是最新的」，于是只清数据不重建表——接下来整轮测试会以
     * "Table 'cothread_test.messages' doesn't exist" 逐个失败，看不出是库坏了。
     */
    const coreTables = ["messages", "users", "projects", "threads"];
    const [tableRows] = await control.query(
      `SELECT table_name t FROM information_schema.tables
       WHERE table_schema=? AND table_name IN (${coreTables.map(() => "?").join(",")})`,
      [sourceDatabase, ...coreTables],
    );
    const presentTables = new Set(tableRows.map((row) => row.t));
    const missingTables = coreTables.filter((name) => !presentTables.has(name));
    const schemaIsCurrent =
      appliedMigrations.size === MIGRATION_NAMES.size &&
      [...MIGRATION_NAMES].every(
        (name) => appliedMigrations.get(name) === MIGRATION_CHECKSUMS.get(name),
      ) &&
      missingTables.length === 0;
    if (schemaIsCurrent) await resetData(control, sourceDatabase);
    else await resetSchema(control, sourceDatabase);
    db = await createDatabase(configured);
    if (!schemaIsCurrent) await migrate(db);

    /**
     * 记下核心表的创建时间。运行期间若它变了，说明有别的进程重建过 schema
     * （DROP + 重建会同时清掉本文件刚写的数据、并把自增列拨回起点），
     * 这时本文件后面的断言全部不可信，必须直接报错而不是让用例莫名失败。
     */
    const schemaEpoch = async () => {
      const [rows] = await control.query(
        "SELECT CREATE_TIME created FROM information_schema.tables WHERE table_schema=? AND table_name='messages'",
        [sourceDatabase],
      );
      return rows[0]?.created ? String(rows[0].created) : "";
    };
    // information_schema 的表元数据缓存已在拿锁后关闭，这里的 CREATE_TIME 是实时的。
    const createdAt = await schemaEpoch();
    // messages 表在建好 schema 后必然存在；捕获不到说明库没建好，直接报错而不是
    // 让后续比较变成空对空、永远不触发。
    if (!createdAt) throw new Error("测试库缺少 messages 表：schema 未正确建立");
    const assertSchemaUntouched = async () => {
      const now = await schemaEpoch();
      // 表被删掉时 now 为空，这也算「schema 变了」——不能当成没变化放过去。
      if (createdAt !== now)
        throw new Error(
          `测试库 schema 在本文件运行期间被重建（messages 表创建时间 ${createdAt || "表已不存在"} → ${now || "表已不存在"}）：` +
            "有另一个进程并发操作同一个测试库，本轮断言结果不可信",
        );
    };

    return {
      db,
      url: configured,
      async reset() {
        await assertLockHeld();
        await assertSchemaUntouched();
        await resetData(control, sourceDatabase);
      },
      async close() {
        await assertSchemaUntouched().catch(() => {});
        await db.end();
        try {
          if (locked) await control.query("SELECT RELEASE_LOCK(?)", [lockName]);
        } finally {
          await control.end();
        }
      },
    };
  } catch (error) {
    await db?.end().catch(() => {});
    if (locked) await control.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
    await control.end().catch(() => {});
    throw error;
  }
}
