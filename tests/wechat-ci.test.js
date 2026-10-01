import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, createPrivateKey, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
} from "../server/miniprogram-config.js";
import {
  ensureMiniprogramWorkspace,
  miniprogramWorkspaceFolders,
  publishMiniprogramSourceFile,
} from "../server/miniprogram-workspace.js";
import {
  buildReleaseDesc,
  detectImageMime,
  listMiniprogramDeployments,
  normalizeWechatPrivateKey,
  previewMiniprogram,
  readMiniprogramDeployment,
  redactSecrets,
  resolveProjectConfig,
  setWechatCiFactory,
  setWechatCiRunner,
  uploadMiniprogram,
} from "../server/wechat-ci.js";
import { executeRelease } from "../server/release-executor.js";
import { approveReleaseRequest, submitReleaseRequest } from "../server/release-requests.js";

const VALID_APP_ID = "wx1234567890abcdef";
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCfakeKeyMaterialForTests
-----END PRIVATE KEY-----`;

async function seed(database, { withKey = true, withAppId = true } = {}) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "微信发布" });
  await saveProjectMiniProgramConfig(service, user, project.id, {
    enabled: true,
    appId: withAppId ? VALID_APP_ID : null,
    cloudbaseEnvs: { development: { envId: "dev-env-wx" } },
  });
  if (withKey) {
    await saveProjectMiniProgramSecret(service, user, project.id, "wechat_upload_key", {
      value: PRIVATE_KEY,
    });
  }
  await ensureMiniprogramWorkspace(database.db, project.id);
  const { byKind } = await miniprogramWorkspaceFolders(database.db, project.id);
  return { user, service, project, sourceFolderId: byKind.get("miniprogram_source").id };
}

async function writeSource(db, projectId, folderId, path, content, createdBy) {
  // Use the real publish path so a rewrite appends a version to the existing
  // artifact instead of leaving two same-named files behind.
  const published = await publishMiniprogramSourceFile(db, { id: createdBy }, projectId, {
    area: "miniprogram_source",
    path,
    content: Buffer.from(content),
  });
  return published.versionId;
}

async function seedMinimalApp(
  database,
  project,
  folderId,
  createdBy,
  { withProjectConfig = false } = {},
) {
  await writeSource(
    database.db,
    project.id,
    folderId,
    "app.json",
    JSON.stringify({ pages: ["pages/index"] }),
    createdBy,
  );
  await writeSource(database.db, project.id, folderId, "app.js", "App({})", createdBy);
  if (withProjectConfig) {
    await writeSource(
      database.db,
      project.id,
      folderId,
      "project.config.json",
      JSON.stringify({ appid: VALID_APP_ID, compileType: "miniprogram" }),
      createdBy,
    );
  }
}

/** Fake WeChat CI that records calls and can write a QR file or fail. */
function fakeCi(calls, { failUpload, failPreview, writeQr = true } = {}) {
  return {
    Project: class Project {
      constructor(options) {
        calls.push({ op: "Project", options: { ...options, privateKeyPath: "[path]" } });
        this.options = options;
      }
    },
    async preview(options) {
      calls.push({
        op: "preview",
        desc: options.desc,
        robot: options.robot,
        pagePath: options.pagePath,
      });
      if (failPreview) throw new Error(`preview rejected: ${failPreview}`);
      // Real PNG magic bytes: the preview result sniffs the payload type.
      if (writeQr) {
        await writeFile(
          options.qrcodeOutputDest,
          Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.from("PNG-BYTES"),
          ]),
        );
      }
      options.onProgressUpdate?.("compiling");
      return { subPackageInfo: [{ name: "__FULL__", size: 1234 }] };
    },
    async upload(options) {
      calls.push({
        op: "upload",
        version: options.version,
        desc: options.desc,
        robot: options.robot,
      });
      if (failUpload) throw new Error(`upload rejected: ${failUpload}`);
      return { subPackageInfo: [{ name: "__APP__", size: 4321 }] };
    },
  };
}

test("redaction removes key blocks and credential-shaped strings", () => {
  const text = `starting\n${PRIVATE_KEY}\nAKIDabcdefghijklmnop\nsecret id error`;
  const out = redactSecrets(text, [PRIVATE_KEY]);
  assert.equal(out.includes("PRIVATE KEY"), false);
  assert.equal(out.includes("fakeKeyMaterialForTests"), false);
  assert.equal(out.includes("AKIDabcdefghijklmnop"), false);
  assert.match(out, /secret id error/);
});

test("release descriptions follow the configured template", () => {
  assert.equal(buildReleaseDesc(null, { version: "1.2.3", desc: "手动" }), "手动");
  assert.equal(
    buildReleaseDesc("v{version} · {date}", { version: "1.2.3" }),
    `v1.2.3 · ${new Date().toISOString().slice(0, 10)}`,
  );
});

test("project.config.json is reused when present and synthesized otherwise", () => {
  const synthesized = resolveProjectConfig([{ path: "app.json" }], VALID_APP_ID);
  assert.equal(synthesized.synthesized, true);
  assert.match(synthesized.content, new RegExp(VALID_APP_ID));

  const reused = resolveProjectConfig(
    [{ path: "project.config.json", versionId: "v-1" }],
    VALID_APP_ID,
  );
  assert.equal(reused.synthesized, false);
  assert.equal(reused.versionId, "v-1");
});

test("preview needs AppID and a private key, with actionable errors", async () => {
  const database = await testDatabase();
  try {
    const noKey = await seed(database, { withKey: false });
    await assert.rejects(
      () => previewMiniprogram(noKey.service, noKey.user, noKey.project.id, {}),
      (error) => error.status === 409 && /上传私钥/.test(error.message),
    );
    const noApp = await seed(database, { withAppId: false });
    await assert.rejects(
      () => previewMiniprogram(noApp.service, noApp.user, noApp.project.id, {}),
      (error) => error.status === 409 && /AppID/.test(error.message),
    );
    const empty = await seed(database);
    await assert.rejects(
      () => previewMiniprogram(empty.service, empty.user, empty.project.id, {}),
      (error) => error.status === 409 && /源文件目录为空/.test(error.message),
    );
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("preview generates a QR code, records the deployment and cleans up", async () => {
  const database = await testDatabase();
  const calls = [];
  setWechatCiFactory(async () => fakeCi(calls));
  const before = new Set(await readdir(tmpdir()));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);

    const result = await previewMiniprogram(service, user, project.id, { desc: "验收预览" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.appId, VALID_APP_ID);
    assert.equal(
      result.projectConfigSynthesized,
      true,
      "a Dimina-style source gets a synthesized config",
    );
    assert.equal(
      result.qrcodeMime,
      "image/png",
      "the type comes from the payload, not an assumption",
    );
    assert.match(Buffer.from(result.qrcodeBase64, "base64").toString("utf8"), /PNG-BYTES/);
    assert.equal(result.desc, "验收预览");

    // The private key is handed to CI from a temp path, never from the project.
    const projectCall = calls.find((call) => call.op === "Project");
    assert.equal(projectCall.options.appid, VALID_APP_ID);
    assert.equal(projectCall.options.privateKeyPath, "[path]");

    const [row] = await query(
      database.db,
      "SELECT target,status,source_hash FROM miniprogram_deployments WHERE id=?",
      [result.deploymentId],
    );
    assert.equal(row.target, "wechat_preview");
    assert.equal(row.status, "succeeded");
    assert.equal(row.source_hash, result.sourceHash);

    // The temporary workspace is gone once the call returns.
    const after = new Set(await readdir(tmpdir()));
    const leaked = [...after].filter(
      (name) => name.startsWith("cothread-wechat-") && !before.has(name),
    );
    assert.deepEqual(leaked, [], "temporary release directories must be removed");
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("preview honours a project-provided config and rejects an appid mismatch", async () => {
  const database = await testDatabase();
  setWechatCiFactory(async () => fakeCi([]));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id, { withProjectConfig: true });
    const result = await previewMiniprogram(service, user, project.id, {});
    assert.equal(result.projectConfigSynthesized, false);

    // Now break the appid inside the project config.
    await writeSource(
      database.db,
      project.id,
      sourceFolderId,
      "project.config.json",
      JSON.stringify({ appid: "wx0000000000000000" }),
      user.id,
    );
    await assert.rejects(
      () => previewMiniprogram(service, user, project.id, {}),
      (error) => error.status === 409 && /不一致/.test(error.message),
    );
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("a failed preview is recorded with a redacted log", async () => {
  const database = await testDatabase();
  const calls = [];
  setWechatCiFactory(async () => fakeCi(calls, { failPreview: PRIVATE_KEY }));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);

    await assert.rejects(
      () => previewMiniprogram(service, user, project.id, {}),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(
          error.message.includes("PRIVATE KEY"),
          false,
          "the key never reaches the error",
        );
        assert.equal(error.message.includes("fakeKeyMaterialForTests"), false);
        return true;
      },
    );
    assert.equal(
      calls.some((call) => call.op === "preview"),
      true,
    );

    const [row] = await query(
      database.db,
      "SELECT status,log FROM miniprogram_deployments WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(row.status, "failed");
    assert.equal(
      row.log.includes("fakeKeyMaterialForTests"),
      false,
      "the key never reaches the log",
    );
    assert.match(row.log, /preview rejected/);
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("upload has no bypass: it must carry approval-flow authorization", async () => {
  const database = await testDatabase();
  const calls = [];
  setWechatCiFactory(async () => fakeCi(calls));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);

    // No authorization at all — this is the only upload path, so it must refuse.
    await assert.rejects(
      () => uploadMiniprogram(service, user, project.id, { version: "1.0.0" }),
      (error) => error.status === 403 && /只能经发布审批流执行/.test(error.message),
    );
    assert.equal(calls.length, 0, "an unauthorized upload never reaches WeChat");

    // Approval-flow authorization is what unlocks the release.
    const requestId = randomUUID();
    const uploaded = await uploadMiniprogram(service, user, project.id, {
      version: "1.0.0",
      desc: "首个版本",
      authorization: { requestId, approvedBy: user.id },
    });
    assert.equal(uploaded.status, "succeeded");
    assert.equal(uploaded.version, "1.0.0");
    assert.equal(uploaded.confirmedBy, user.id);

    const uploadCall = calls.find((call) => call.op === "upload");
    assert.equal(uploadCall.version, "1.0.0");
    assert.equal(uploadCall.desc, "首个版本");

    // A malformed authorization is rejected before any provider call.
    await assert.rejects(
      () =>
        uploadMiniprogram(service, user, project.id, {
          version: "1.0.1",
          authorization: { requestId: "not-a-uuid", approvedBy: user.id },
        }),
      (error) => error.name === "ZodError" || error.status === 400,
    );
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("deployments are listed and readable only by project members", async () => {
  const database = await testDatabase();
  setWechatCiFactory(async () => fakeCi([]));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);
    const preview = await previewMiniprogram(service, user, project.id, {});

    const list = await listMiniprogramDeployments(service, user, project.id);
    assert.equal(list.deployments.length, 1);
    assert.equal(list.deployments[0].id, preview.deploymentId);
    const detail = await readMiniprogramDeployment(service, user, project.id, preview.deploymentId);
    assert.equal(detail.status, "succeeded");
    assert.equal(typeof detail.log, "string");

    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => listMiniprogramDeployments(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () => readMiniprogramDeployment(service, outsider, project.id, preview.deploymentId),
      (error) => error.status === 403 || error.status === 404,
    );
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("the isolated runner contains a crash instead of taking down the API", async () => {
  const database = await testDatabase();
  const dir = await mkdtemp(join(tmpdir(), "cothread-fake-runner-"));
  const runner = join(dir, "fake-runner.mjs");
  await writeFile(
    runner,
    `
import { readFileSync, writeFileSync } from "node:fs";
const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
const resultPath = process.argv[3];
const mode = String(request.desc || "");
if (mode === "crash") {
  console.error("compiler blew up " + ${JSON.stringify(PRIVATE_KEY)});
  process.exit(3);
}
if (mode === "hang") { setTimeout(() => {}, 60000); }
else {
  writeFileSync(resultPath, JSON.stringify({ ok: true, result: { subPackageInfo: [{ name: "__FULL__", size: 10 }] }, log: "compiled" }));
}
`,
    "utf8",
  );
  setWechatCiRunner(runner);
  process.env.WECHAT_CI_TIMEOUT_MS = "4000";
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);

    await assert.rejects(
      () => previewMiniprogram(service, user, project.id, { desc: "crash" }),
      (error) => {
        assert.equal(error.status, 502);
        assert.match(error.message, /微信 CI 进程异常退出/);
        assert.equal(error.message.includes("PRIVATE KEY"), false);
        assert.equal(error.message.includes("fakeKeyMaterialForTests"), false);
        return true;
      },
    );
    const [failed] = await query(
      database.db,
      "SELECT status,log FROM miniprogram_deployments WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    assert.equal(failed.status, "failed");
    assert.equal(failed.log.includes("fakeKeyMaterialForTests"), false);
    assert.match(failed.log, /compiler blew up/);

    await assert.rejects(
      () => previewMiniprogram(service, user, project.id, { desc: "hang" }),
      (error) => error.status === 502 && /超时/.test(error.message),
    );

    const ok = await previewMiniprogram(service, user, project.id, { desc: "fine" });
    assert.equal(ok.status, "succeeded");
    assert.equal(ok.qrcodeBase64, null, "no QR file was written by the fake runner");
    assert.equal(ok.summary.subPackageInfo[0].name, "__FULL__");
  } finally {
    delete process.env.WECHAT_CI_TIMEOUT_MS;
    setWechatCiRunner(null);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await database.close();
  }
});

test("a missing QR image is reported instead of faked", async () => {
  const database = await testDatabase();
  setWechatCiFactory(async () => fakeCi([], { writeQr: false }));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);
    const result = await previewMiniprogram(service, user, project.id, {});
    assert.equal(result.status, "succeeded");
    assert.equal(result.qrcodeBase64, null);
    assert.equal(result.qrcodeMime, null);
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("the approval flow is what actually reaches WeChat", async () => {
  const database = await testDatabase();
  const calls = [];
  setWechatCiFactory(async () => fakeCi(calls));
  try {
    const { user, service, project, sourceFolderId } = await seed(database);
    await seedMinimalApp(database, project, sourceFolderId, user.id);

    // Submitting records intent only.
    const request = await submitReleaseRequest(service, user, project.id, {
      target: "wechat_upload",
      version: "9.9.9",
      releaseNote: "审批流集成验证",
    });
    assert.equal(request.status, "pending");
    assert.equal(calls.length, 0, "submitting must not touch WeChat");

    // Approving runs the shared executor, which performs the upload.
    const approved = await approveReleaseRequest(service, user, project.id, request.id, {
      note: "同意",
      execute: (row) => executeRelease(service, user, project.id, row),
    });
    assert.equal(approved.status, "succeeded");
    assert.ok(approved.deploymentId, "the deployment id is written back on the request");

    const uploadCall = calls.find((call) => call.op === "upload");
    assert.equal(uploadCall.version, "9.9.9");
    assert.equal(uploadCall.desc, "审批流集成验证");

    const [deployment] = await query(
      database.db,
      "SELECT target,version,status,confirmed_by FROM miniprogram_deployments WHERE id=?",
      [approved.deploymentId],
    );
    assert.equal(deployment.target, "wechat_upload");
    assert.equal(deployment.version, "9.9.9");
    assert.equal(deployment.status, "succeeded");
    assert.equal(deployment.confirmed_by, user.id);
  } finally {
    setWechatCiFactory(null);
    await database.close();
  }
});

test("the upload key is normalized from a bare base64 body into a real PEM", () => {
  // The WeChat console hands out a bare base64 body; OpenSSL rejects it as-is
  // (errCode 20002 DECODER routines::unsupported).
  const { privateKey: pkcs1 } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const bare = pkcs1.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const normalized = normalizeWechatPrivateKey(bare);
  assert.match(normalized, /^-----BEGIN (RSA )?PRIVATE KEY-----/);
  assert.equal(createPrivateKey(normalized).asymmetricKeyType, "rsa");

  // A real PEM passes through unchanged.
  const { privateKey: pkcs8 } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  assert.equal(normalizeWechatPrivateKey(pkcs8), pkcs8);

  assert.throws(
    () => normalizeWechatPrivateKey("not a key at all !!"),
    (error) => error.status === 400 && /base64/.test(error.message),
  );
  assert.throws(
    () =>
      normalizeWechatPrivateKey(
        "TUlJRXZ3SUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCSzl3Z2dTckFnRUFBb0lCQVFE",
      ),
    (error) => error.status === 400 && /无法解析/.test(error.message),
  );
});

test("the QR mime type is sniffed from the bytes, not assumed", () => {
  // WeChat returns a JPEG even though the option is called qrcodeFormat "image".
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(
    detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png",
  );
  assert.equal(detectImageMime(Buffer.from("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(detectImageMime(Buffer.from("GIF89a")), "image/gif");
  assert.equal(detectImageMime(Buffer.from([1, 2, 3, 4])), "application/octet-stream");
});
