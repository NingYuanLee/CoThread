import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";

let directTransport;
let directKey = "";
const bypassTransports = new Map();
let resolvedCache;
let warnedFakeIp = false;

const DOH_ENDPOINTS = [
  (hostname) => `https://dns.alidns.com/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  (hostname) => `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
];

export function smtpTransportUrl(value = process.env.SMTP_URL) {
  const raw = String(value || "").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SMTP_URL 必须是有效的 SMTP 连接地址");
  }
  if (
    !["smtp:", "smtps:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password
  )
    throw new Error("SMTP_URL 必须包含协议、服务器、账号和授权码");
  return raw;
}

/** 198.18.0.0/15 是基准测试地址，Clash / Surge 等 fake-ip 用它冒充解析结果。 */
export function isBenchmarkFakeIp(address) {
  if (net.isIP(address) !== 4) return false;
  const [first, second] = address.split(".");
  return first === "198" && (second === "18" || second === "19");
}

async function queryPublicAddresses(hostname, fetchImpl) {
  const errors = [];
  for (const endpoint of DOH_ENDPOINTS) {
    const url = endpoint(hostname);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const answers = Array.isArray(body?.Answer) ? body.Answer : [];
      const ips = [
        ...new Set(
          answers
            .filter((item) => Number(item?.type) === 1 && typeof item.data === "string")
            .map((item) => item.data)
            .filter((ip) => net.isIP(ip) === 4 && !isBenchmarkFakeIp(ip)),
        ),
      ];
      if (ips.length) return ips;
      errors.push(`${new URL(url).hostname} 没有可用 A 记录`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "查询失败");
    }
  }
  throw new Error(
    `本机 DNS 把 SMTP 服务器解析到了不可用地址，公共 DNS 也没有返回可用地址（${errors.join("；")}）`,
  );
}

export async function resolvePublicSmtpHost(
  hostname,
  { lookup = dns.lookup, fetchImpl = globalThis.fetch } = {},
) {
  if (net.isIP(hostname)) return { hosts: [hostname], servername: hostname, bypassedFakeIp: false };
  let records = [];
  try {
    records = (await lookup(hostname, { all: true })) || [];
  } catch {
    records = [];
  }
  const usable = records.filter(
    (record) => record.family === 4 && !isBenchmarkFakeIp(record.address),
  );
  if (usable.length) return { hosts: [hostname], servername: hostname, bypassedFakeIp: false };
  const sawFakeIp = records.some((record) => isBenchmarkFakeIp(record.address));
  if (!sawFakeIp && records.length)
    return { hosts: [hostname], servername: hostname, bypassedFakeIp: false };
  const hosts = await queryPublicAddresses(hostname, fetchImpl);
  return { hosts, servername: hostname, bypassedFakeIp: true };
}

export function smtpConnectionOptions(rawUrl, { host, servername }) {
  const url = new URL(rawUrl);
  const secure = url.protocol === "smtps:";
  const options = {
    host,
    port: Number(url.port || (secure ? 465 : 587)),
    secure,
    auth: {
      user: decodeURIComponent(url.username),
      pass: decodeURIComponent(url.password),
    },
  };
  if (servername && net.isIP(host)) {
    options.servername = servername;
    options.tls = { servername };
  }
  return options;
}

async function resolutionFor(raw, refresh) {
  const hostname = new URL(raw).hostname;
  if (
    !refresh &&
    resolvedCache &&
    resolvedCache.raw === raw &&
    resolvedCache.expires > Date.now()
  ) {
    return resolvedCache.value;
  }
  const value = await resolvePublicSmtpHost(hostname);
  if (value.bypassedFakeIp && !warnedFakeIp) {
    warnedFakeIp = true;
    console.warn(
      `SMTP 域名 ${hostname} 被本机 DNS 解析到不可用假 IP，已改用公共 DNS ${value.hosts.join(", ")}`,
    );
  }
  resolvedCache = { raw, value, expires: Date.now() + 60_000 };
  return value;
}

async function transportsToTry(refresh = false) {
  if (!process.env.EMAIL_FROM) throw new Error("邮件服务尚未配置");
  const raw = smtpTransportUrl();
  const resolved = await resolutionFor(raw, refresh);
  if (!resolved.bypassedFakeIp) {
    if (!directTransport || directKey !== raw) {
      directTransport = nodemailer.createTransport(raw);
      directKey = raw;
    }
    return [directTransport];
  }
  return resolved.hosts.map((host) => {
    const key = `${raw}\n${host}`;
    let transport = bypassTransports.get(key);
    if (!transport) {
      transport = nodemailer.createTransport(
        smtpConnectionOptions(raw, { host, servername: resolved.servername }),
      );
      bypassTransports.set(key, transport);
    }
    return transport;
  });
}

function isTransientSmtpError(error) {
  return [
    "ECONNRESET",
    "ESOCKET",
    "ETIMEDOUT",
    "ECONNECTION",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EDNS",
  ].includes(error?.code);
}

const purposeNames = { register: "注册账号", bind: "绑定邮箱", recover: "重置密码" };
export async function sendVerificationEmail({ email, code, purpose }) {
  const action = purposeNames[purpose] || "验证邮箱";
  const message = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `共序 ${action}验证码`,
    text: `你的共序${action}验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发。`,
    html: `<p>你的共序${action}验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
  };
  const deliver = async (refresh) => {
    const transports = await transportsToTry(refresh);
    let lastError;
    for (const transport of transports) {
      try {
        const result = await transport.sendMail(message);
        const accepted = (result.accepted || []).map((value) => String(value).toLowerCase());
        if (!accepted.includes(email.toLowerCase())) throw new Error("收件服务器未接受验证码邮件");
        return { status: "accepted", messageId: result.messageId };
      } catch (error) {
        if (!isTransientSmtpError(error)) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("验证码发送失败");
  };
  try {
    return await deliver(false);
  } catch (error) {
    if (!isTransientSmtpError(error)) throw error;
    directTransport = undefined;
    directKey = "";
    bypassTransports.clear();
    resolvedCache = undefined;
    return await deliver(true);
  }
}
