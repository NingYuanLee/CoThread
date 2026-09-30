import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDatabase, query } from "../server/db.js";
import { ipv4ToLong } from "../server/ip-location.js";
import { migrate } from "./migrate.js";
import { assertProductionWriteAllowed } from "../server/database-policy.js";

const DEFAULT_SOURCE_URL =
  process.env.IP_GEOLOCATION_SOURCE_URL ||
  "https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ipv4_source.txt";

function cleanPart(value) {
  const text = String(value || "").trim();
  if (!text || text === "0" || text === "null" || text === "未知") return null;
  return text.slice(0, 80);
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split("|");
  // ipv4_source.txt: start|end|country|province|city|ISP|CC
  // legacy ip.merge.txt: start|end|country|region|province|city|ISP
  if (parts.length < 5) return null;
  const [startRaw, endRaw] = parts;
  const modern = parts.length >= 7 && /^[A-Za-z]{2}$/.test(parts[6] || "");
  const country = parts[2];
  const province = modern ? parts[3] : parts[parts.length >= 7 ? 4 : 3];
  const city = modern ? parts[4] : parts[parts.length >= 7 ? 5 : 4];
  const startIp = /^\d+$/.test(startRaw) ? Number(startRaw) >>> 0 : ipv4ToLong(startRaw);
  const endIp = /^\d+$/.test(endRaw) ? Number(endRaw) >>> 0 : ipv4ToLong(endRaw);
  if (
    startIp === null ||
    endIp === null ||
    Number.isNaN(startIp) ||
    Number.isNaN(endIp) ||
    startIp > endIp
  ) {
    return null;
  }
  return [startIp, endIp, cleanPart(country), cleanPart(province), cleanPart(city), null];
}

async function downloadSource(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载归属地数据失败：${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

async function resolveSourceFile() {
  const fromEnv = process.env.IP_GEOLOCATION_SOURCE_FILE;
  const fromArg = process.argv[2];
  const local = fromEnv || fromArg;
  if (local) {
    const absolute = resolve(local);
    if (!existsSync(absolute)) throw new Error(`本地归属地文件不存在：${absolute}`);
    return { path: absolute, cleanup: false, label: absolute };
  }
  const cacheDir = new URL("../.local/cache/", import.meta.url);
  const cacheFile = new URL("ipv4_source.txt", cacheDir);
  await mkdir(cacheDir, { recursive: true });
  console.log(`下载归属地数据：${DEFAULT_SOURCE_URL}`);
  await downloadSource(DEFAULT_SOURCE_URL, cacheFile);
  return { path: cacheFile, cleanup: true, label: DEFAULT_SOURCE_URL };
}

async function main() {
  const db = await createDatabase();
  let source;
  try {
    await migrate(db);
    source = await resolveSourceFile();
    console.log(`读取归属地数据：${source.label}`);
    const text = await readFile(source.path, "utf8");
    const rows = text.split(/\r?\n/).map(parseLine).filter(Boolean);
    if (!rows.length) throw new Error("归属地数据为空或格式无法识别");
    console.log(`解析 ${rows.length} 条，写入 ip_geolocations …`);
    await query(db, "DELETE FROM ip_geolocations");
    const batchSize = 1000;
    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      const placeholders = batch.map(() => "(?,?,?,?,?,?)").join(",");
      await query(
        db,
        `INSERT INTO ip_geolocations(start_ip,end_ip,country,province,city,district) VALUES ${placeholders}`,
        batch.flat(),
      );
      if ((index + batchSize) % 20000 === 0 || index + batchSize >= rows.length) {
        console.log(`已写入 ${Math.min(index + batchSize, rows.length)} / ${rows.length}`);
      }
    }
    const [{ total }] = await query(db, "SELECT COUNT(*) total FROM ip_geolocations");
    console.log(`完成：ip_geolocations 共 ${total} 条（位于当前 DATABASE_URL 对应库）`);
  } finally {
    await db.end();
    if (source?.cleanup) await unlink(source.path).catch(() => {});
  }
}

if (process.argv[1]?.endsWith("import-ip-geolocations.js")) {
  assertProductionWriteAllowed();
  void main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
