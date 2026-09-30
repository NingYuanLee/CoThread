import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { saveProjectMiniProgramConfig } from "../server/miniprogram-config.js";
import {
  ensureMiniprogramWorkspace,
  miniprogramWorkspaceFolders,
  publishMiniprogramSourceFile,
} from "../server/miniprogram-workspace.js";
import {
  approveReleaseRequest,
  cancelReleaseRequest,
  listReleaseRequests,
  readReleaseRequest,
  rejectReleaseRequest,
  submitReleaseRequest,
  sweepReleaseRequests,
  RELEASE_EXPIRY_HOURS,
} from "../server/release-requests.js";

const VALID_APP_ID = "wx1234567890abcdef";

async function seed(database) {
  const owner = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [owner.id, `${owner.id}@test.com`, "负责人"],
  );
  const service = new Service(database.db);
  const project = await service.createProject(owner, { name: "发布审批" });
  await saveProjectMiniProgramConfig(service, owner, project.id, {
    enabled: true,
    appId: VALID_APP_ID,
    cloudbaseEnvs: { development: { envId: "dev-env-rel" } },
  });
  await ensureMiniprogramWorkspace(database.db, project.id);
  const { byKind } = await miniprogramWorkspaceFolders(database.db, project.id);
  const sourceFolderId = byKind.get("miniprogram_source").id;
  await publishMiniprogramSourceFile(database.db, { id: owner.id }, project.id, {
    area: "miniprogram_source",
    path: "app.json",
    content: Buffer.from(JSON.stringify({ pages: ["pages/index"] })),
  });
  await publishMiniprogramSourceFile(database.db, { id: owner.id }, project.id, {
    area: "miniprogram_source",
    path: "app.js",
    content: Buffer.from("App({})"),
  });
  return { owner, service, project, sourceFolderId };
}

/** Add a project member. members has no id column; PK is (project_id,user_id). */
async function addMember(database, projectId, role) {
  const user = { id: randomUUID(), kind: "session" };
  await query(
    database.db,
    "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
    [user.id, `${user.id}@test.com`, role],
  );
  await query(database.db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,?)", [
    projectId,
    user.id,
    role,
  ]);
  return user;
}

const okExecutor = async () => randomUUID();

test("a submitted request publishes nothing and stays pending", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
      releaseNote: "首个版本",
    });
    assert.equal(request.status, "pending");
    assert.equal(request.statusLabel, "待审批");
    assert.equal(request.version, "1.0.0");
    assert.equal(request.requestedByKind, "session");
    assert.ok(request.sourceHash);

    const list = await listReleaseRequests(service, owner, project.id);
    assert.equal(list.pendingCount, 1);
    assert.equal(list.sourceChanged, false);
  } finally {
    await database.close();
  }
});

test("upload requests require a version", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    await assert.rejects(
      () => submitReleaseRequest(service, owner, project.id, { target: "wechat_upload" }),
      (error) => error.status === 400 && /版本号/.test(error.message),
    );
  } finally {
    await database.close();
  }
});

test("only one unfinished request per target is allowed", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const first = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    await assert.rejects(
      () =>
        submitReleaseRequest(service, owner, project.id, {
          target: "wechat_upload",
          version: "1.0.1",
        }),
      (error) => error.status === 409 && error.message.includes(first.id),
    );
    // A different target is independent.
    const other = await submitReleaseRequest(service, owner, project.id, {
      target: "cloudbase_static",
    });
    assert.equal(other.status, "pending");
  } finally {
    await database.close();
  }
});

test("approval requires the owner role", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const editor = await addMember(database, project.id, "member");
    const viewer = await addMember(database, project.id, "viewer");
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    for (const actor of [editor, viewer]) {
      await assert.rejects(
        () =>
          approveReleaseRequest(service, actor, project.id, request.id, { execute: okExecutor }),
        (error) => error.status === 403,
      );
    }
    const [row] = await query(
      database.db,
      "SELECT status FROM miniprogram_release_requests WHERE id=?",
      [request.id],
    );
    assert.equal(row.status, "pending", "a rejected approver must not change the state");
  } finally {
    await database.close();
  }
});

test("the owner may approve their own request and execution is recorded", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "2.0.0",
    });
    const deploymentId = randomUUID();
    const approved = await approveReleaseRequest(service, owner, project.id, request.id, {
      note: "同意发布",
      execute: async () => deploymentId,
    });
    assert.equal(approved.status, "succeeded");
    assert.equal(approved.deploymentId, deploymentId);
    assert.equal(approved.decidedBy, owner.id);
    assert.equal(approved.attemptCount, 1);
    assert.equal(approved.decisionNote, "同意发布");
  } finally {
    await database.close();
  }
});

test("approving twice does not execute twice", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    let calls = 0;
    const execute = async () => {
      calls += 1;
      return randomUUID();
    };
    await approveReleaseRequest(service, owner, project.id, request.id, { execute });
    await assert.rejects(
      () => approveReleaseRequest(service, owner, project.id, request.id, { execute }),
      (error) => error.status === 409,
    );
    assert.equal(calls, 1, "the CAS claim must hold under a repeat approval");
  } finally {
    await database.close();
  }
});

test("a source change between submit and approve voids the request", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    await publishMiniprogramSourceFile(database.db, { id: owner.id }, project.id, {
      area: "miniprogram_source",
      path: "app.js",
      content: Buffer.from("App({ onLaunch() {} })"),
    });
    let calls = 0;
    await assert.rejects(
      () =>
        approveReleaseRequest(service, owner, project.id, request.id, {
          execute: async () => {
            calls += 1;
            return randomUUID();
          },
        }),
      (error) => error.status === 409 && /源码在申请后发生变更/.test(error.message),
    );
    assert.equal(calls, 0, "the release must never run against a different snapshot");
    const detail = await readReleaseRequest(service, owner, project.id, request.id);
    assert.equal(detail.status, "expired");
    assert.equal(detail.sourceMatches, false);
  } finally {
    await database.close();
  }
});

test("a failing execution is recorded and never retried automatically", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    await assert.rejects(
      () =>
        approveReleaseRequest(service, owner, project.id, request.id, {
          execute: async () => {
            throw new Error("telemetry: WeChat rejected the upload");
          },
        }),
      /WeChat rejected the upload/,
    );
    const detail = await readReleaseRequest(service, owner, project.id, request.id);
    assert.equal(detail.status, "failed");
    assert.match(detail.lastError, /WeChat rejected the upload/);
    assert.equal(detail.attemptCount, 1);
    // A failed request can no longer be approved; a new one is required.
    await assert.rejects(
      () => approveReleaseRequest(service, owner, project.id, request.id, { execute: okExecutor }),
      (error) => error.status === 409,
    );
  } finally {
    await database.close();
  }
});

test("rejection keeps the reason and blocks approval", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    const rejected = await rejectReleaseRequest(service, owner, project.id, request.id, {
      reason: "版本说明不完整",
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.decisionNote, "版本说明不完整");
    await assert.rejects(
      () => approveReleaseRequest(service, owner, project.id, request.id, { execute: okExecutor }),
      (error) => error.status === 409,
    );
    // Rejection frees the target for a fresh request.
    const again = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.1",
    });
    assert.equal(again.status, "pending");
  } finally {
    await database.close();
  }
});

test("only the requester can withdraw, and only while pending", async () => {
  const database = await testDatabase();
  try {
    const { owner, service, project } = await seed(database);
    const other = await addMember(database, project.id, "member");
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    await assert.rejects(
      () => cancelReleaseRequest(service, other, project.id, request.id),
      (error) => error.status === 403,
    );
    const cancelled = await cancelReleaseRequest(service, owner, project.id, request.id);
    assert.equal(cancelled.status, "cancelled");
    await assert.rejects(
      () => cancelReleaseRequest(service, owner, project.id, request.id),
      (error) => error.status === 409,
    );
  } finally {
    await database.close();
  }
});

test("stale pending requests expire and interrupted executions are flagged", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const { owner, service, project } = await seed(database);
    const request = await submitReleaseRequest(service, owner, project.id, {
      target: "wechat_upload",
      version: "1.0.0",
    });
    await query(
      db,
      `UPDATE miniprogram_release_requests SET created_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR) WHERE id=?`,
      [RELEASE_EXPIRY_HOURS + 1, request.id],
    );
    const swept = await sweepReleaseRequests(db, project.id);
    assert.equal(swept.expired, 1);
    const detail = await readReleaseRequest(service, owner, project.id, request.id);
    assert.equal(detail.status, "expired");

    // A request stuck in executing becomes failed with a verify-first message.
    const second = await submitReleaseRequest(service, owner, project.id, {
      target: "cloudbase_static",
    });
    await query(
      db,
      "UPDATE miniprogram_release_requests SET status='executing',updated_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 120 MINUTE) WHERE id=?",
      [second.id],
    );
    const swept2 = await sweepReleaseRequests(db, project.id);
    assert.equal(swept2.interrupted, 1);
    const stuck = await readReleaseRequest(service, owner, project.id, second.id);
    assert.equal(stuck.status, "failed");
    assert.match(stuck.lastError, /可能已上传成功/);
  } finally {
    await database.close();
  }
});

test("non-members cannot read or submit requests", async () => {
  const database = await testDatabase();
  try {
    const { service, project } = await seed(database);
    const outsider = { id: randomUUID(), kind: "session" };
    await query(
      database.db,
      "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [outsider.id, `${outsider.id}@test.com`, "外部"],
    );
    await assert.rejects(
      () => listReleaseRequests(service, outsider, project.id),
      (error) => error.status === 403 || error.status === 404,
    );
    await assert.rejects(
      () =>
        submitReleaseRequest(service, outsider, project.id, {
          target: "wechat_upload",
          version: "1.0.0",
        }),
      (error) => error.status === 403 || error.status === 404,
    );
  } finally {
    await database.close();
  }
});
