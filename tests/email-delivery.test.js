import test from "node:test";
import assert from "node:assert/strict";
import { smtpTransportUrl } from "../server/email-delivery.js";

test("SMTP configuration uses one authenticated connection URL", () => {
  const value = "smtps://cothread%40example.com:encoded%3Asecret@smtp.example.com:465";
  assert.equal(smtpTransportUrl(value), value);
  assert.throws(() => smtpTransportUrl(""), /有效的 SMTP/);
  assert.throws(() => smtpTransportUrl("https://example.com"), /协议、服务器、账号和授权码/);
  assert.throws(() => smtpTransportUrl("smtps://smtp.example.com:465"), /协议、服务器、账号和授权码/);
});
