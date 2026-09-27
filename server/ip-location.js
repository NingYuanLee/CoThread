import { query } from "./db.js";

function normalizedIp(value = "") {
  const ip = value.split(",")[0].trim();
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip || "未知";
}

function localLocation(ip) {
  if (ip === "127.0.0.1" || ip === "::1")
    return { country: "本机", province: null, city: null, district: null };
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    return { country: "内网", province: null, city: null, district: null };
  return null;
}

export function ipv4ToLong(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function cleanPart(value) {
  const text = String(value || "").trim();
  if (!text || text === "0" || text === "null" || text === "未知") return null;
  return text.slice(0, 80);
}

export async function resolveIpLocation(db, rawIp) {
  const ip = normalizedIp(rawIp);
  const local = localLocation(ip);
  if (local) return { ip, ...local };
  const ipNum = ipv4ToLong(ip);
  if (ipNum === null || !db) {
    return { ip, country: null, province: null, city: null, district: null };
  }
  try {
    const [row] = await query(
      db,
      `SELECT country, province, city, district
       FROM ip_geolocations
       WHERE start_ip <= ? AND end_ip >= ?
       ORDER BY start_ip DESC
       LIMIT 1`,
      [ipNum, ipNum],
    );
    if (!row) return { ip, country: null, province: null, city: null, district: null };
    return {
      ip,
      country: cleanPart(row.country),
      province: cleanPart(row.province),
      city: cleanPart(row.city),
      district: cleanPart(row.district),
    };
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return { ip, country: null, province: null, city: null, district: null };
    }
    throw error;
  }
}
