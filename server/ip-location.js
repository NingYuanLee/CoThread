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

export async function resolveIpLocation(rawIp) {
  const ip = normalizedIp(rawIp);
  const local = localLocation(ip);
  if (local) return { ip, ...local };
  const template = process.env.IP_GEOLOCATION_URL;
  if (!template) return { ip, country: null, province: null, city: null, district: null };
  try {
    const response = await fetch(template.replace("{ip}", encodeURIComponent(ip)), {
      headers: process.env.IP_GEOLOCATION_TOKEN ? { Authorization: `Bearer ${process.env.IP_GEOLOCATION_TOKEN}` } : {},
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) throw new Error("location lookup failed");
    const result = await response.json();
    return {
      ip,
      country: String(result.country_name || result.country || "").slice(0, 80) || null,
      province: String(result.region_name || result.region || result.province || "").slice(0, 80) || null,
      city: String(result.city || "").slice(0, 80) || null,
      district: String(result.district || result.county || "").slice(0, 80) || null,
    };
  } catch {
    return { ip, country: null, province: null, city: null, district: null };
  }
}
