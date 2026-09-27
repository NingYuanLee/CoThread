import test from "node:test";
import assert from "node:assert/strict";
import { ipv4ToLong, resolveIpLocation } from "../server/ip-location.js";

test("ipv4ToLong encodes dotted quads", () => {
  assert.equal(ipv4ToLong("0.0.0.0"), 0);
  assert.equal(ipv4ToLong("1.2.3.4"), ((1 * 256 + 2) * 256 + 3) * 256 + 4);
  assert.equal(ipv4ToLong("255.255.255.255"), 4294967295);
  assert.equal(ipv4ToLong("1.2.3"), null);
  assert.equal(ipv4ToLong("1.2.3.256"), null);
});

test("resolveIpLocation reads ranges from the application database", async () => {
  const local = await resolveIpLocation({}, "127.0.0.1");
  assert.equal(local.country, "本机");

  const calls = [];
  const db = {
    async execute(sql, params) {
      calls.push({ sql, params });
      return [[{ country: "测试国", province: "测试省", city: "测试市", district: null }]];
    },
  };
  const hit = await resolveIpLocation(db, "203.0.113.10");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ip_geolocations/);
  assert.deepEqual(calls[0].params, [ipv4ToLong("203.0.113.10"), ipv4ToLong("203.0.113.10")]);
  assert.deepEqual(
    { country: hit.country, province: hit.province, city: hit.city, district: hit.district },
    { country: "测试国", province: "测试省", city: "测试市", district: null },
  );

  const emptyDb = {
    async execute() {
      return [[]];
    },
  };
  const miss = await resolveIpLocation(emptyDb, "198.51.100.1");
  assert.equal(miss.country, null);
});
