import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { createApp } from "../server/app.js";

test("email registration, binding and password recovery verify codes without replacing account names", async () => {
  const database = await testDatabase();
  const sent = [];
  const server = createApp(database.db, {
    sendVerificationEmail: async (message) => sent.push(message),
    createHumanChallenge: () => ({ text: "human", data: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" }),
  }).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, data, cookie) => {
      const response = await fetch(base + path, { method: data === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      return { status: response.status, body: await response.json(), cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") || undefined };
    };
    const humanProof = async (purpose, cookie) => {
      const response = await request(`/human-verification?purpose=${purpose}`, undefined, cookie);
      assert.equal(response.status, 200);
      assert.match(response.body.image, /^data:image\/svg\+xml;base64,/);
      return { humanChallengeId: response.body.challengeId, humanAnswer: "human" };
    };
    const password = "Reg123!x";
    const registrationInput = { email: "first@example.com", password };
    const registration = await request("/email/register/request", {
      ...registrationInput, humanChallengeId: "", humanAnswer: " ",
    });
    assert.equal(registration.status, 200);
    assert.equal(sent[0].purpose, "register");
    const cooldown = await request("/email/register/request", registrationInput, registration.cookie);
    assert.equal(cooldown.status, 429);
    assert.match(cooldown.body.error, /秒后重新发送/);
    assert.equal(sent.length, 1);
    const [storedChallenge] = await query(database.db, "SELECT code_hash FROM email_challenges WHERE id=?", [registration.body.challengeId]);
    assert.notEqual(storedChallenge.code_hash, sent[0].code);
    const registered = await request("/email/register/confirm", { challengeId: registration.body.challengeId, code: sent[0].code });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.username, "first@example.com");
    assert.match(registered.body.name, /^用户\d{6}$/);
    assert.ok(registered.body.user_number >= 100000 && registered.body.user_number <= 999999);
    assert.ok(registered.cookie);
    assert.equal((await request("/me", undefined, registered.cookie)).status, 200);

    const login = await request("/login", { identifier: "first@example.com", password });
    assert.equal(login.status, 200);
    assert.equal(login.body.username, "first@example.com");
    assert.equal(login.body.email, "first@example.com");

    const binding = await request("/email/bind/request", { email: "second@example.com" }, login.cookie);
    assert.equal(binding.status, 200);
    const bound = await request("/email/bind/confirm", { challengeId: binding.body.challengeId, code: sent.at(-1).code }, login.cookie);
    assert.equal(bound.status, 200);
    assert.equal(bound.body.username, "first@example.com");
    assert.equal(bound.body.email, "second@example.com");

    await query(database.db, "UPDATE email_challenges SET created_at=DATE_SUB(created_at,INTERVAL 61 SECOND) WHERE email=?", ["second@example.com"]);
    const newPassword = "Newpass8!";
    const recovery = await request("/email/recover/request", { email: "second@example.com", password: newPassword });
    const recovered = await request("/email/recover/confirm", { challengeId: recovery.body.challengeId, code: sent.at(-1).code });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.username, "first@example.com");
    assert.ok(recovered.cookie);
    assert.equal((await request("/me", undefined, recovered.cookie)).status, 200);
    assert.equal((await request("/login", { identifier: "first@example.com", password })).status, 401);
    assert.equal((await request("/login", { identifier: "second@example.com", password: newPassword })).status, 200);

    const actions = await query(database.db, "SELECT action FROM account_change_logs ORDER BY created_at,id");
    for (const action of ["registered", "email_bound", "password_recovered"])
      assert.ok(actions.some((row) => row.action === action));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});

test("human verification is browser scoped and shared by registration, reset and login", async () => {
  const database = await testDatabase();
  const sent = [];
  const server = createApp(database.db, {
    sendVerificationEmail: async (message) => sent.push(message),
    createHumanChallenge: () => ({ text: "human", data: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" }),
  }).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, data, cookie) => {
      const response = await fetch(base + path, { method: data === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      return { status: response.status, body: await response.json(),
        cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") || cookie };
    };
    const proof = async (cookie) => {
      const challenge = await request("/human-verification?purpose=auth", undefined, cookie);
      return { cookie: challenge.cookie, humanChallengeId: challenge.body.challengeId, humanAnswer: "human" };
    };

    let emailBrowser;
    let firstChallenge;
    for (let index = 0; index < 3; index++) {
      const response = await request("/email/register/request", {
        email: `threshold-${index}@example.com`, password: "Threshold8!",
      }, emailBrowser);
      assert.equal(response.status, 200);
      emailBrowser = response.cookie;
      if (index === 0) firstChallenge = response.body.challengeId;
    }
    assert.equal((await request("/human-verification/status?scope=auth", undefined, emailBrowser)).body.required, true);
    assert.equal((await request("/email/register/request", {
      email: "threshold-3@example.com", password: "Threshold8!",
    }, emailBrowser)).status, 400);
    assert.equal((await request("/login", {
      identifier: "nobody", password: "Threshold8!",
    }, emailBrowser)).status, 400);
    assert.equal((await request("/human-verification/status?scope=auth")).body.required, false);

    const registered = await request("/email/register/confirm", { challengeId: firstChallenge, code: sent[0].code });
    assert.equal(registered.status, 201);
    let loginBrowser;
    for (let index = 0; index < 3; index++) {
      const failed = await request("/login", {
        identifier: "threshold-0@example.com", password: "wrong-password",
      }, loginBrowser);
      assert.equal(failed.status, 401);
      loginBrowser = failed.cookie;
    }
    assert.equal((await request("/login", {
      identifier: "threshold-0@example.com", password: "Threshold8!",
    }, loginBrowser)).status, 400);
    const human = await proof(loginBrowser);
    loginBrowser = human.cookie;
    assert.equal((await request("/login", {
      identifier: "threshold-0@example.com", password: "Threshold8!",
      humanChallengeId: human.humanChallengeId, humanAnswer: human.humanAnswer,
    }, loginBrowser)).status, 200);
    assert.equal((await request("/human-verification/status?scope=auth", undefined, loginBrowser)).body.required, false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
});
