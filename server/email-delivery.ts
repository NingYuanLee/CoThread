import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let directTransport: Transporter | undefined;
let directKey = "";
const bypassTransports = new Map<string, Transporter>();
let resolvedCache: { raw: string; value: ResolvedSmtpHost; expires: number } | undefined;
let warnedFakeIp = false;

/** 一个 DNS 记录。 */
type LookupRecord = { address: string; family: number };

/** 解析结果：可用的主机地址、TLS 的名称以及是否绕过了假 IP。 */
export type ResolvedSmtpHost = {
  hosts: string[];
  servername: string;
  bypassedFakeIp: boolean;
};

/** SMTP 连接参数；仅在直连 IP 时补 servername 与 tls。 */
export type SmtpConnectionOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  servername?: string;
  tls?: { servername: string };
};

const DOH_ENDPOINTS: ((hostname: string) => string)[] = [
  (hostname) => `https://dns.alidns.com/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  (hostname) => `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
];

export function smtpTransportUrl(value: unknown = process.env.SMTP_URL): string {
  const raw = String(value || "").trim();
  let url: URL;
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
export function isBenchmarkFakeIp(address: string): boolean {
  if (net.isIP(address) !== 4) return false;
  const [first, second] = address.split(".");
  return first === "198" && (second === "18" || second === "19");
}

async function queryPublicAddresses(hostname: string, fetchImpl: typeof fetch): Promise<string[]> {
  const errors: string[] = [];
  for (const endpoint of DOH_ENDPOINTS) {
    const url = endpoint(hostname);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { Answer?: unknown };
      const answers = Array.isArray(body?.Answer) ? (body.Answer as Record<string, unknown>[]) : [];
      const ips = [
        ...new Set(
          answers
            .filter((item) => Number(item?.type) === 1 && typeof item.data === "string")
            .map((item) => item.data as string)
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
  hostname: string,
  {
    lookup = dns.lookup as unknown as (
      hostname: string,
      options: { all: true },
    ) => Promise<LookupRecord[]>,
    fetchImpl = globalThis.fetch,
  }: {
    lookup?: (hostname: string, options: { all: true }) => Promise<LookupRecord[]>;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ResolvedSmtpHost> {
  if (net.isIP(hostname)) return { hosts: [hostname], servername: hostname, bypassedFakeIp: false };
  let records: LookupRecord[] = [];
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

export function smtpConnectionOptions(
  rawUrl: string,
  { host, servername }: { host: string; servername?: string },
): SmtpConnectionOptions {
  const url = new URL(rawUrl);
  const secure = url.protocol === "smtps:";
  const options: SmtpConnectionOptions = {
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

async function resolutionFor(raw: string, refresh: boolean): Promise<ResolvedSmtpHost> {
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

async function transportsToTry(refresh: boolean = false): Promise<Transporter[]> {
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

function isTransientSmtpError(error: unknown): boolean {
  return [
    "ECONNRESET",
    "ESOCKET",
    "ETIMEDOUT",
    "ECONNECTION",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EDNS",
  ].includes(String((error as { code?: unknown } | null)?.code));
}

const purposeNames: Record<string, string> = {
  register: "注册账号",
  bind: "绑定邮箱",
  recover: "重置密码",
};

/** 发送验证码邮件的结果。 */
export type VerificationEmailResult = { status: "accepted"; messageId?: string };

export async function sendVerificationEmail({
  email,
  code,
  purpose,
}: {
  email: string;
  code: string;
  purpose: string;
}): Promise<VerificationEmailResult> {
  const action = purposeNames[purpose] || "验证邮箱";
  const message = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `共序 ${action}验证码`,
    text: `你的共序${action}验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发。`,
    html: `<p>你的共序${action}验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
  };
  const deliver = async (refresh: boolean): Promise<VerificationEmailResult> => {
    const transports = await transportsToTry(refresh);
    let lastError: unknown;
    for (const transport of transports) {
      try {
        const result = await transport.sendMail(message);
        const accepted = (result.accepted || []).map((value: unknown) =>
          String(value).toLowerCase(),
        );
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
