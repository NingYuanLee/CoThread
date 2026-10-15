import test from "node:test";
import assert from "node:assert/strict";
import {
  isBenchmarkFakeIp,
  resolvePublicSmtpHost,
  smtpConnectionOptions,
  smtpTransportUrl,
} from "../server/email-delivery.js";

test("SMTP configuration uses one authenticated connection URL", () => {
  const value = "smtps://cothread%40example.com:encoded%3Asecret@smtp.example.com:465";
  assert.equal(smtpTransportUrl(value), value);
  assert.throws(() => smtpTransportUrl(""), /有效的 SMTP/);
  assert.throws(() => smtpTransportUrl("https://example.com"), /协议、服务器、账号和授权码/);
  assert.throws(
    () => smtpTransportUrl("smtps://smtp.example.com:465"),
    /协议、服务器、账号和授权码/,
  );
});

test("benchmark fake-ip range is recognized without treating real addresses as fake", () => {
  assert.equal(isBenchmarkFakeIp("198.18.1.195"), true);
  assert.equal(isBenchmarkFakeIp("198.19.255.1"), true);
  assert.equal(isBenchmarkFakeIp("59.82.44.168"), false);
  assert.equal(isBenchmarkFakeIp("127.0.0.1"), false);
  assert.equal(isBenchmarkFakeIp("smtp.example.com"), false);
});

test("public DNS result keeps the hostname for nodemailer", async () => {
  let fetched = false;
  const resolved = await resolvePublicSmtpHost("smtp.example.com", {
    lookup: async () => [{ address: "59.82.44.168", family: 4 }],
    fetchImpl: async () => {
      fetched = true;
      throw new Error("should not fetch");
    },
  });
  assert.equal(fetched, false);
  assert.equal(resolved.bypassedFakeIp, false);
  assert.deepEqual(resolved.hosts, ["smtp.example.com"]);
  assert.equal(resolved.servername, "smtp.example.com");
});

test("literal SMTP host is not rewritten", async () => {
  const resolved = await resolvePublicSmtpHost("127.0.0.1", {
    lookup: async () => {
      throw new Error("should not look up an IP");
    },
  });
  assert.deepEqual(resolved.hosts, ["127.0.0.1"]);
  assert.equal(resolved.bypassedFakeIp, false);
});

test("fake-ip DNS falls back to public DNS and keeps TLS server name", async () => {
  const fetched = [];
  const resolved = await resolvePublicSmtpHost("smtp.qiye.aliyun.com", {
    lookup: async () => [{ address: "198.18.1.195", family: 4 }],
    fetchImpl: async (url) => {
      fetched.push(String(url));
      if (fetched.length === 1) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          Status: 0,
          Answer: [
            { type: 1, data: "198.18.0.1" },
            { type: 1, data: "59.82.44.168" },
            { type: 1, data: "59.82.9.178" },
            { type: 5, data: "ignored.example" },
          ],
        }),
      };
    },
  });
  assert.equal(fetched.length, 2);
  assert.equal(resolved.bypassedFakeIp, true);
  assert.deepEqual(resolved.hosts, ["59.82.44.168", "59.82.9.178"]);
  assert.equal(resolved.servername, "smtp.qiye.aliyun.com");
  const raw = "smtps://cothread%40example.com:encoded%3Asecret@smtp.qiye.aliyun.com:465";
  const options = smtpConnectionOptions(raw, {
    host: resolved.hosts[0],
    servername: resolved.servername,
  });
  assert.equal(options.host, "59.82.44.168");
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.servername, "smtp.qiye.aliyun.com");
  assert.equal(options.tls.servername, "smtp.qiye.aliyun.com");
  assert.equal(options.auth.user, "cothread@example.com");
  assert.equal(options.auth.pass, "encoded:secret");
});

test("fake-ip without a usable public address fails clearly", async () => {
  await assert.rejects(
    () =>
      resolvePublicSmtpHost("smtp.example.com", {
        lookup: async () => [{ address: "198.18.1.1", family: 4 }],
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ Answer: [{ type: 1, data: "198.18.2.2" }] }),
        }),
      }),
    /不可用地址/,
  );
});
