import { randomUUID } from "node:crypto";
import { query } from "./db.js";

export async function saveVisualArtifact(db, {
  projectId,
  content,
  mime = "image/png",
  source,
  agentEventId = null,
  agentProjectEventId = null,
}) {
  if (!Buffer.isBuffer(content) || !content.length) throw new Error("视觉附件为空");
  if (content.length > 4 * 1024 * 1024) throw new Error("视觉附件超过 4 MiB");
  const id = randomUUID();
  await query(db, `INSERT INTO agent_visual_artifacts
    (id,project_id,agent_event_id,agent_project_event_id,source,mime,content)
    VALUES(?,?,?,?,?,?,?)`, [id, projectId, agentEventId, agentProjectEventId, source, mime, content]);
  return { id, url: `/api/agent-visual-artifacts/${id}`, mime, bytes: content.length };
}

export async function readVisualArtifact(db, id, projectId) {
  const [row] = await query(db,
    "SELECT id,mime,content FROM agent_visual_artifacts WHERE id=? AND project_id=?",
    [id, projectId]);
  return row || null;
}
