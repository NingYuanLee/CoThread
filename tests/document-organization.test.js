import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { queueDocumentOrganization } from "../server/document-organization.js";
import { processNextDocumentOrganization } from "../server/document-organization-run.js";

test("formal file organization is blocked before L1 when the official area has no documents", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
      [user.id, `${user.id}@test.com`, "负责人"]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "空文档库" });
    await assert.rejects(queueDocumentOrganization(service, user, { projectId: project.id }),
      (error) => error.status === 409 && /没有可整理的文档/.test(error.message));
    const jobId = randomUUID();
    await query(db, `INSERT INTO document_organization_jobs(id,project_id,thread_id,scope,requested_by)
      VALUES(?,?,NULL,'project',?)`, [jobId, project.id, user.id]);
    let planned = 0;
    assert.equal(await processNextDocumentOrganization(db, { createPlan: async () => {
      planned += 1;
      return { documents: [] };
    } }), true);
    assert.equal(planned, 0);
    const [job] = await query(db, "SELECT status,result FROM document_organization_jobs WHERE id=?", [jobId]);
    assert.equal(job.status, "completed");
    assert.equal(JSON.parse(typeof job.result === "string" ? job.result : JSON.stringify(job.result)).checked, 0);
  } finally {
    await database.close();
  }
});
