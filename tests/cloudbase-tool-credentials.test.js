import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import "./miniprogram-ready.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import {
  saveProjectMiniProgramConfig,
  saveProjectMiniProgramSecret,
} from "../server/miniprogram-config.js";
import { saveMiniprogramPublishableKey } from "../server/miniprogram-auth-config.js";
import {
  addCloudbaseDocument,
  cloudbaseFileUrls,
  deleteCloudbaseFiles,
  invokeCloudbaseFunction,
  listCloudbaseAccountEnvironments,
  listCloudbaseCollections,
  listCloudbaseFiles,
  queryCloudbaseDocuments,
  resetCloudbaseClients,
  searchCloudbaseFunctionLogs,
  setCloudbaseClientFactory,
  setCloudbaseManagerFactory,
  uploadCloudbaseFile,
} from "../server/cloudbase.js";

const APP_ID = "wx1234567890abcdef";
const SECRET_ID = "AKIDtoolcredtest000001";
const SECRET_KEY = "tool-cred-secret-key";
const SERVER_API_KEY = "server-api-key-for-dev-env";

test("CloudBase tools inject the credential each call needs", async () => {
  const database = await testDatabase();
  const clientCalls = [];
  const managerCalls = [];
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, user.id + "@test.com", "负责人"],
    );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "密钥注入" });
    await saveProjectMiniProgramConfig(service, user, project.id, {
      appId: APP_ID,
      cloudbaseEnvs: { development: { envId: "dev-env" } },
    });
    await saveProjectMiniProgramSecret(service, user, project.id, "cloudbase_credential", {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
    });
    await saveMiniprogramPublishableKey(
      database.db,
      project.id,
      "development",
      "publishable-key",
      user.id,
      SERVER_API_KEY,
    );

    setCloudbaseClientFactory(async (options) => {
      clientCalls.push(options);
      const collection = () => {
        const api = {
          where() {
            return api;
          },
          limit() {
            return api;
          },
          skip() {
            return api;
          },
          async get() {
            return { data: [] };
          },
          async add() {
            return { id: "doc-1" };
          },
        };
        return api;
      };
      return {
        database: () => ({ collection }),
        async uploadFile() {
          return { fileID: "cloud://file" };
        },
        async getTempFileURL() {
          return { fileList: [] };
        },
        async deleteFile() {
          return { fileList: [] };
        },
      };
    });
    setCloudbaseManagerFactory(async (options) => {
      managerCalls.push(options);
      return {
        env: {
          async describeEnvs() {
            return { EnvList: [{ EnvId: "dev-env", Alias: "开发" }] };
          },
        },
        database: {
          async listCollections() {
            return { Collections: [] };
          },
        },
        storage: {
          async listCurrentDirectory() {
            return { directories: [], files: [] };
          },
        },
        currentEnvironment() {
          return {
            getFunctionService: () => ({
              async invokeFunction() {
                return { ok: true };
              },
            }),
            getLogService: () => ({
              async searchClsLog() {
                return { Results: [] };
              },
            }),
          };
        },
        async listFiles() {
          return { Contents: [] };
        },
      };
    });

    await queryCloudbaseDocuments(service, user, project.id, { collection: "notes" });
    await addCloudbaseDocument(service, user, project.id, {
      collection: "notes",
      document: { title: "a" },
    });
    await uploadCloudbaseFile(service, user, project.id, {
      cloudPath: "uploads/a.txt",
      content: "hi",
    });
    await cloudbaseFileUrls(service, user, project.id, { fileList: ["cloud://file"] });
    await deleteCloudbaseFiles(service, user, project.id, { fileList: ["cloud://file"] });
    await listCloudbaseCollections(service, user, project.id, {});
    await listCloudbaseFiles(service, user, project.id, { cloudPath: "uploads" });
    await invokeCloudbaseFunction(service, user, project.id, { name: "echo" });
    await searchCloudbaseFunctionLogs(service, user, project.id, { name: "echo" });
    await listCloudbaseAccountEnvironments(service, user, project.id);

    // Calls in the same project environment reuse one data-plane client.
    assert.equal(clientCalls.length, 1);
    for (const call of clientCalls) {
      assert.equal(call.accessKey, SERVER_API_KEY);
      assert.equal(call.envId, "dev-env");
    }
    // Management operations share a manager; account enumeration uses its own.
    assert.equal(managerCalls.length, 2);
    for (const call of managerCalls) {
      assert.equal(call.credential.secretId, SECRET_ID);
      assert.equal(call.credential.secretKey, SECRET_KEY);
    }
  } finally {
    setCloudbaseClientFactory(null);
    setCloudbaseManagerFactory(null);
    resetCloudbaseClients();
    await database.close();
  }
});
