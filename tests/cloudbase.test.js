import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
} from "../server/miniprogram-config.js";
import {
  addCloudbaseDocument,
  assertAgentEnvironment,
  cloudbaseFileUrls,
  deleteCloudbaseFiles,
  getCloudbaseClient,
  parseCloudbaseCredential,
  queryCloudbaseDocuments,
  readCloudbaseEnvironments,
  removeCloudbaseDocument,
  resetCloudbaseClients,
  resolveCloudbaseEnv,
  setCloudbaseClientFactory,
  setCloudbaseManagerFactory,
  listCloudbaseCollections,
  listCloudbaseFiles,
  updateCloudbaseDocument,
  uploadCloudbaseFile,
} from "../server/cloudbase.js";

const VALID_APP_ID = "wx1234567890abcdef";

/** Minimal stand-in for the CloudBase server SDK, recording every call. */
function fakeCloudbase(calls, { failOn } = {}) {
  const collection = (name) => {
    const state = { name, where: null, limit: null, skip: null };
    const api = {
      where(filter) {
        state.where = filter;
        return api;
      },
      limit(value) {
        state.limit = value;
        return api;
      },
      skip(value) {
        state.skip = value;
        return api;
      },
      async get() {
        calls.push({ op: "get", collection: name, ...state });
        if (failOn === "get") throw new Error("provider rejected query");
        return { data: [{ _id: "doc-1", title: "hello", _openid: "internal" }] };
      },
      async add(document) {
        calls.push({ op: "add", collection: name, document });
        return { id: "doc-new" };
      },
      doc(id) {
        return {
          async update(patch) {
            calls.push({ op: "update", collection: name, id, patch });
            return { updated: 1 };
          },
          async remove() {
            calls.push({ op: "remove", collection: name, id });
            return { deleted: 1 };
          },
        };
      },
    };
    return api;
  };
  return {
    database: () => ({ collection }),
    async uploadFile(options) {
      calls.push({ op: "uploadFile", ...options, fileContent: undefined });
      return { fileID: `cloud://${options.cloudPath}` };
    },
    async getTempFileURL({ fileList }) {
      calls.push({ op: "getTempFileURL", fileList });
      return {
        fileList: fileList.map((fileID) => ({ fileID, tempFileURL: `https://cdn/${fileID}` })),
      };
    },
    async deleteFile({ fileList }) {
      calls.push({ op: "deleteFile", fileList });
      return { fileList: fileList.map((fileID) => ({ fileID, code: "SUCCESS" })) };
    },
  };
}

async function seed(
  database,
  { withCredential = true, environments = { development: "dev-env-cb" } } = {},
) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(user, { name: "云开发" });
  const cloudbaseEnvs = {};
  for (const [kind, envId] of Object.entries(environments)) cloudbaseEnvs[kind] = { envId };
  await saveProjectMiniProgramConfig(service, user, project.id, {
    enabled: true,
    appId: VALID_APP_ID,
    cloudbaseEnvs,
  });
  if (withCredential) {
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      value: JSON.stringify({ secretId: "AKIDexample", secretKey: "secret-example" }),
    });
  }
  return { user, service, project };
}

test("cloudbase credential formats are parsed and rejected explicitly", () => {
  assert.deepEqual(parseCloudbaseCredential('{"secretId":"a","secretKey":"b"}'), {
    secretId: "a",
    secretKey: "b",
    token: null,
    sessionToken: null,
  });
  assert.deepEqual(parseCloudbaseCredential("a:b:c"), {
    secretId: "a",
    secretKey: "b:c",
    token: null,
    sessionToken: null,
  });
  assert.equal(parseCloudbaseCredential("id,key").secretKey, "key");

  // A bare token (JWT) is a real credential form for the data plane; the early
  // parser rejected it, which made token-only credentials look malformed.
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJhIjoxfQ.abcdefghij";
  assert.deepEqual(parseCloudbaseCredential(jwt), {
    secretId: null,
    secretKey: null,
    token: jwt,
    sessionToken: jwt,
  });
  const fromJson = parseCloudbaseCredential(JSON.stringify({ token: jwt }));
  assert.equal(fromJson.token, jwt);
  assert.equal(fromJson.secretId, null);
  // Keys plus a session token keep working.
  const withSession = parseCloudbaseCredential(
    JSON.stringify({ secretId: "a", secretKey: "b", sessionToken: jwt }),
  );
  assert.equal(withSession.sessionToken, jwt);

  assert.throws(
    () => parseCloudbaseCredential(""),
    (error) => error.status === 409,
  );
  assert.throws(
    () => parseCloudbaseCredential("{not json"),
    (error) => error.status === 400,
  );
  assert.throws(
    () => parseCloudbaseCredential('{"secretId":"a"}'),
    (error) => error.status === 400,
  );
  // Too short to be a token and has no separator: still rejected.
  assert.throws(
    () => parseCloudbaseCredential("nocolon"),
    (error) => error.status === 400 && /token/.test(error.message),
  );
  assert.throws(
    () => parseCloudbaseCredential("has spaces in it here"),
    (error) => error.status === 400,
  );
});

test("environment resolution follows the project config and env whitelist", () => {
  const runtime = {
    cloudbaseEnvs: { development: { envId: "dev-1" }, production: { envId: "prod-1" } },
  };
  assert.equal(resolveCloudbaseEnv(runtime, "development").envId, "dev-1");
  assert.equal(resolveCloudbaseEnv(runtime, "production").envId, "prod-1");
  assert.throws(
    () => resolveCloudbaseEnv(runtime, "nope"),
    (error) => error.status === 400,
  );
  assert.throws(
    () => resolveCloudbaseEnv({ cloudbaseEnvs: {} }, "development"),
    (error) => error.status === 409,
  );
  assert.equal(resolveCloudbaseEnv(runtime).envId, "dev-1", "development is the default");
});

test("agents are confined to the development environment", () => {
  assert.equal(assertAgentEnvironment(undefined), "development");
  assert.equal(assertAgentEnvironment("development"), "development");
  assert.throws(
    () => assertAgentEnvironment("production"),
    (error) => error.status === 403,
  );
  assert.throws(
    () => assertAgentEnvironment("staging"),
    (error) => error.status === 403,
  );
});

test("environment overview reports configuration without claiming a health check", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database);
    const view = await readCloudbaseEnvironments(service, user, project.id);
    const development = view.environments.find((item) => item.kind === "development");
    const production = view.environments.find((item) => item.kind === "production");
    assert.equal(development.configured, true);
    assert.equal(development.envId, "dev-env-cb");
    assert.equal(development.agentAllowed, true);
    assert.equal(production.configured, false);
    assert.equal(production.agentAllowed, false);
    assert.equal(view.hasCredential, true);
    assert.equal(view.defaultEnvironment, "development");
    // Collection/file enumeration now goes through the management-plane SDK.
    assert.equal(view.enumeration, "supported");
  } finally {
    await database.close();
  }
});

test("missing credentials block client creation with an actionable error", async () => {
  const database = await testDatabase();
  try {
    const { user, service, project } = await seed(database, { withCredential: false });
    await assert.rejects(
      () => getCloudbaseClient(service, project.id, "development"),
      (error) => error.status === 409 && /凭据/.test(error.message),
    );
    assert.ok((await readCloudbaseEnvironments(service, user, project.id)).hasCredential === false);
  } finally {
    await database.close();
  }
});

test("database queries use the configured collection and hide provider internals", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseClientFactory(async () => fakeCloudbase(calls));
  try {
    const { user, service, project } = await seed(database);
    const result = await queryCloudbaseDocuments(service, user, project.id, {
      collection: "orders",
      where: { status: "open" },
      limit: 5,
    });
    assert.equal(result.collection, "orders");
    assert.equal(result.envId, "dev-env-cb");
    assert.equal(result.count, 1);
    assert.equal(result.documents[0].title, "hello");
    assert.equal(result.documents[0]._openid, undefined, "provider internals are stripped");
    assert.deepEqual(calls[0], {
      op: "get",
      collection: "orders",
      name: "orders",
      where: { status: "open" },
      limit: 5,
      skip: null,
    });
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("database limits are clamped and bad input is rejected", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseClientFactory(async () => fakeCloudbase(calls));
  try {
    const { user, service, project } = await seed(database);
    const big = await queryCloudbaseDocuments(service, user, project.id, {
      collection: "orders",
      limit: 100000,
    });
    assert.equal(big.limit, 200, "query limit is capped");
    await assert.rejects(
      () => queryCloudbaseDocuments(service, user, project.id, { collection: "bad name!" }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () => queryCloudbaseDocuments(service, user, project.id, { collection: "" }),
      (error) => error.status === 400,
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("document writes map to add, update and remove", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseClientFactory(async () => fakeCloudbase(calls));
  try {
    const { user, service, project } = await seed(database);
    const added = await addCloudbaseDocument(service, user, project.id, {
      collection: "orders",
      document: { title: "new" },
    });
    assert.equal(added.id, "doc-new");

    const updated = await updateCloudbaseDocument(service, user, project.id, {
      collection: "orders",
      id: "doc-1",
      patch: { title: "renamed" },
    });
    assert.equal(updated.updated, 1);

    const removed = await removeCloudbaseDocument(service, user, project.id, {
      collection: "orders",
      id: "doc-1",
    });
    assert.equal(removed.deleted, 1);

    assert.deepEqual(
      calls.map((call) => call.op),
      ["add", "update", "remove"],
    );

    await assert.rejects(
      () =>
        addCloudbaseDocument(service, user, project.id, { collection: "orders", document: "text" }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () =>
        updateCloudbaseDocument(service, user, project.id, {
          collection: "orders",
          id: "doc-1",
          patch: {},
        }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () => removeCloudbaseDocument(service, user, project.id, { collection: "orders" }),
      (error) => error.status === 400,
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("storage upload, temporary URLs and delete reach the client", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseClientFactory(async () => fakeCloudbase(calls));
  try {
    const { user, service, project } = await seed(database);
    const upload = await uploadCloudbaseFile(service, user, project.id, {
      cloudPath: "/uploads/logo.png",
      content: Buffer.from("binary"),
    });
    assert.equal(upload.cloudPath, "uploads/logo.png");
    assert.equal(upload.fileID, "cloud://uploads/logo.png");
    assert.equal(upload.bytes, 6);

    const urls = await cloudbaseFileUrls(service, user, project.id, {
      fileList: ["cloud://uploads/logo.png"],
    });
    assert.equal(urls.files[0].tempFileURL, "https://cdn/cloud://uploads/logo.png");

    const deleted = await deleteCloudbaseFiles(service, user, project.id, {
      fileList: ["cloud://uploads/logo.png"],
    });
    assert.equal(deleted.result[0].code, "SUCCESS");

    assert.deepEqual(
      calls.map((call) => call.op),
      ["uploadFile", "getTempFileURL", "deleteFile"],
    );

    await assert.rejects(
      () =>
        uploadCloudbaseFile(service, user, project.id, {
          cloudPath: "../escape",
          content: Buffer.from("x"),
        }),
      (error) => error.status === 400,
    );
    await assert.rejects(
      () => cloudbaseFileUrls(service, user, project.id, { fileList: [] }),
      (error) => error.status === 400,
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("clients are cached per project and environment, and reset on credential change", async () => {
  const database = await testDatabase();
  let created = 0;
  setCloudbaseClientFactory(async () => {
    created += 1;
    return fakeCloudbase([]);
  });
  try {
    const { user, service, project } = await seed(database);
    await getCloudbaseClient(service, project.id, "development");
    await getCloudbaseClient(service, project.id, "development");
    assert.equal(created, 1, "the same environment reuses one client");

    await saveProjectMiniProgramConfig(service, user, project.id, {
      enabled: true,
      appId: VALID_APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env-cb" }, staging: { envId: "stage-env-cb" } },
    });
    await getCloudbaseClient(service, project.id, "staging");
    assert.equal(created, 2, "a different environment gets its own client");

    resetCloudbaseClients(project.id);
    await getCloudbaseClient(service, project.id, "development");
    assert.equal(created, 3, "resetting discards cached clients");
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("provider failures are mapped to an actionable 502, not an empty 500", async () => {
  const database = await testDatabase();
  setCloudbaseClientFactory(async () => fakeCloudbase([], { failOn: "get" }));
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () => queryCloudbaseDocuments(service, user, project.id, { collection: "orders" }),
      (error) => {
        assert.equal(error.status, 502);
        assert.match(error.message, /CloudBase 查询文档失败/);
        assert.match(error.message, /provider rejected query/);
        return true;
      },
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

test("only project members can reach CloudBase helpers", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseClientFactory(async () => fakeCloudbase(calls));
  try {
    const { service, project } = await seed(database);
    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => readCloudbaseEnvironments(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () => queryCloudbaseDocuments(service, outsider, project.id, { collection: "orders" }),
      (error) => error.status === 403 || error.status === 404,
    );
    assert.equal(calls.length, 0);
  } finally {
    resetCloudbaseClients();
    setCloudbaseClientFactory(null);
    await database.close();
  }
});

/** Minimal stand-in for the CloudBase management SDK. */
function fakeManager(calls, { failCollections } = {}) {
  return {
    database: {
      async listCollections() {
        calls.push({ op: "listCollections" });
        if (failCollections) throw new Error(failCollections);
        return { Collections: [{ CollectionName: "users" }, { CollectionName: "orders" }] };
      },
    },
    storage: {
      async listDirectoryFiles(cloudPath) {
        calls.push({ op: "listDirectoryFiles", cloudPath });
        return [
          { Key: "uploads/", Size: 0 },
          { Key: "uploads/logo.png", Size: 1024, LastModified: "2026-09-30T00:00:00Z" },
        ];
      },
    },
  };
}

test("collections are listed through the management plane", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { user, service, project } = await seed(database);
    const result = await listCloudbaseCollections(service, user, project.id, {});
    assert.equal(result.envId, "dev-env-cb");
    assert.equal(result.environment, "development");
    assert.deepEqual(result.collections, ["orders", "users"], "names are sorted");
    assert.equal(result.count, 2);
    assert.deepEqual(calls, [{ op: "listCollections" }]);

    // The overview now reports enumeration as available.
    const view = await readCloudbaseEnvironments(service, user, project.id);
    assert.equal(view.enumeration, "supported");
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("storage files are listed with metadata and path traversal is refused", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { user, service, project } = await seed(database);
    const result = await listCloudbaseFiles(service, user, project.id, { cloudPath: "/uploads" });
    assert.equal(result.cloudPath, "uploads");
    assert.equal(result.count, 2);
    assert.equal(result.files[1].key, "uploads/logo.png");
    assert.equal(result.files[1].size, 1024);
    assert.equal(result.files[1].lastModified, "2026-09-30T00:00:00Z");
    assert.equal(result.files[0].isDirectory, true);
    assert.deepEqual(calls, [{ op: "listDirectoryFiles", cloudPath: "uploads" }]);

    // An empty path means the whole bucket.
    await listCloudbaseFiles(service, user, project.id, {});
    assert.equal(calls[1].cloudPath, "");

    await assert.rejects(
      () => listCloudbaseFiles(service, user, project.id, { cloudPath: "../../etc" }),
      (error) => error.status === 400,
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("management-plane provider failures map to an actionable 502", async () => {
  const database = await testDatabase();
  setCloudbaseManagerFactory(async () => fakeManager([], { failCollections: "manager said no" }));
  try {
    const { user, service, project } = await seed(database);
    await assert.rejects(
      () => listCloudbaseCollections(service, user, project.id, {}),
      (error) => {
        assert.equal(error.status, 502);
        assert.match(error.message, /CloudBase 列举集合失败/);
        assert.match(error.message, /manager said no/);
        return true;
      },
    );
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("management clients are cached per environment and cleared on reset", async () => {
  const database = await testDatabase();
  let created = 0;
  setCloudbaseManagerFactory(async () => {
    created += 1;
    return fakeManager([]);
  });
  try {
    const { user, service, project } = await seed(database);
    await listCloudbaseCollections(service, user, project.id, {});
    await listCloudbaseCollections(service, user, project.id, {});
    assert.equal(created, 1, "the same environment reuses one manager");
    resetCloudbaseClients(project.id);
    await listCloudbaseCollections(service, user, project.id, {});
    assert.equal(created, 2, "reset discards cached managers too");
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});

test("management-plane reads stay behind project membership", async () => {
  const database = await testDatabase();
  const calls = [];
  setCloudbaseManagerFactory(async () => fakeManager(calls));
  try {
    const { service, project } = await seed(database);
    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => listCloudbaseCollections(service, outsider, project.id, {}),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () => listCloudbaseFiles(service, outsider, project.id, {}),
      (error) => error.status === 403 || error.status === 404,
    );
    assert.equal(calls.length, 0, "no provider call happens before the permission check");
  } finally {
    resetCloudbaseClients();
    setCloudbaseManagerFactory(null);
    await database.close();
  }
});
