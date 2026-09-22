import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { decryptToken } from "./credential-vault.js";
import { HttpError } from "./service.js";
import {
  listProjectCodeConfig,
  revealProjectCodeConnectorToken,
  upsertProjectCodeConnector,
} from "./project-code-sources.js";

const MASTERGO_BASE = process.env.MASTERGO_API_BASE_URL || "https://mastergo.com";
const MAX_SCOPE = 20;
const MAX_DSL_CHARS = 400_000;
const vaultId = (projectId) => `project:${projectId}`;

function redactedDesignResource(row) {
  return {
    id: row.id,
    platform: row.platform || "mastergo",
    fileId: row.external_id,
    layerId: row.layer_id || "",
    label: row.label,
    resourceUrl: row.resource_url || null,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export async function listProjectDesignConfig(service, user, projectId) {
  const config = await listProjectCodeConfig(service, user, projectId);
  const rows = await query(service.db, `SELECT id,platform,external_id,layer_id,label,resource_url,sort_order,updated_at
    FROM project_design_resources WHERE project_id=? AND platform='mastergo' ORDER BY sort_order,id`, [projectId]);
  return {
    ...config,
    designResources: rows.map(redactedDesignResource),
  };
}

export async function upsertMastergoConnector(service, user, projectId, input) {
  const body = { ...input, kind: "mastergo", organizationId: null };
  await upsertProjectCodeConnector(service, user, projectId, body);
  return listProjectDesignConfig(service, user, projectId);
}

export async function revealMastergoToken(service, user, projectId) {
  return revealProjectCodeConnectorToken(service, user, projectId, "mastergo");
}

async function loadMastergoToken(db, projectId) {
  const [row] = await query(db, `SELECT enabled,token_ciphertext FROM project_code_connectors
    WHERE project_id=? AND kind='mastergo'`, [projectId]);
  if (!row?.token_ciphertext) throw new HttpError(409, "请先保存 MasterGo 连接器令牌");
  if (!Number(row.enabled)) throw new HttpError(409, "请先启用 MasterGo 连接器");
  return decryptToken(row.token_ciphertext, vaultId(projectId));
}

function mastergoHeaders(token) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-MG-UserAccessToken": token,
  };
}

async function fetchMastergoJson(path, token, params = {}) {
  const url = new URL(path, MASTERGO_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      headers: mastergoHeaders(token),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new HttpError(400, `MasterGo 请求失败：网络错误 ${error?.message || error}`);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const detail = typeof body === "object" && body
      ? (body.message || body.error || body.code || JSON.stringify(body).slice(0, 300))
      : String(text || response.statusText).slice(0, 300);
    throw new HttpError(400, `MasterGo 请求失败（HTTP ${response.status}）：${detail || "无详情"}`);
  }
  return body;
}

/** Parse MasterGo file / short links into fileId + optional layerId. */
export async function parseMastergoUrl(rawUrl, token = null) {
  const input = String(rawUrl || "").trim();
  if (!input) throw new HttpError(400, "请粘贴 MasterGo 设计稿链接");
  let target = input;
  if (target.includes("/goto/")) {
    if (!token) throw new HttpError(400, "解析短链需要已保存的 MasterGo 令牌");
    let response;
    try {
      response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        headers: mastergoHeaders(token),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new HttpError(400, `解析 MasterGo 短链失败：${error?.message || error}`);
    }
    const location = response.headers.get("location");
    if (!location || !(response.status >= 300 && response.status < 400)) {
      throw new HttpError(400, "无法解析 MasterGo 短链，请改用含 fileId 的完整链接");
    }
    target = new URL(location, MASTERGO_BASE).toString();
  }
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new HttpError(400, "MasterGo 链接无效");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const fileIndex = parts.findIndex((part) => part === "file" || part === "files");
  let fileId = fileIndex >= 0 ? parts[fileIndex + 1] : null;
  if (!fileId) {
    const numeric = parts.find((part) => /^\d{6,}$/.test(part));
    fileId = numeric || null;
  }
  if (!fileId) throw new HttpError(400, "链接中未找到 fileId，请复制 MasterGo 文件地址");
  const layerId = url.searchParams.get("layer_id")
    || url.searchParams.get("layerId")
    || url.searchParams.get("source_layer_id")
    || "";
  return {
    fileId: String(fileId).slice(0, 191),
    layerId: String(layerId || "").slice(0, 191),
    resourceUrl: target.slice(0, 1024),
    label: deriveLabel(url, fileId, layerId),
  };
}

function deriveLabel(url, fileId, layerId) {
  const fromPath = url.pathname.split("/").filter(Boolean).pop();
  if (fromPath && fromPath !== fileId && fromPath !== "file" && fromPath !== "files") {
    return decodeURIComponent(fromPath).slice(0, 128);
  }
  return layerId ? `${fileId} / ${layerId}`.slice(0, 128) : String(fileId).slice(0, 128);
}

export async function resolveMastergoUrl(service, user, projectId, input) {
  await service.member(user, projectId, true, service.db, true);
  const data = z.object({ url: z.string().trim().min(1).max(2048) }).parse(input);
  const token = await loadMastergoToken(service.db, projectId);
  return parseMastergoUrl(data.url, token);
}

export async function syncMastergoScope(service, user, projectId, input) {
  await service.member(user, projectId, true, service.db, true);
  await loadMastergoToken(service.db, projectId);
  const data = z.object({
    files: z.array(z.object({
      fileId: z.string().trim().min(1).max(191),
      layerId: z.string().trim().max(191).optional().nullable(),
      label: z.string().trim().min(1).max(128),
      resourceUrl: z.string().trim().max(1024).optional().nullable(),
    })).max(MAX_SCOPE),
  }).parse(input);
  const seen = new Set();
  const normalized = data.files.map((item, index) => {
    const fileId = item.fileId.trim();
    const layerId = String(item.layerId || "").trim();
    const key = `${fileId}\0${layerId}`;
    if (seen.has(key)) throw new HttpError(400, "范围列表包含重复设计稿");
    seen.add(key);
    return {
      fileId,
      layerId,
      label: item.label.trim(),
      resourceUrl: item.resourceUrl?.trim() || null,
      sortOrder: index,
    };
  });
  await transaction(service.db, async (db) => {
    const existing = await query(db,
      `SELECT id,external_id,layer_id FROM project_design_resources WHERE project_id=? AND platform='mastergo'`,
      [projectId]);
    const byKey = new Map(existing.map((row) => [`${row.external_id}\0${row.layer_id || ""}`, row]));
    const keep = new Set(normalized.map((item) => `${item.fileId}\0${item.layerId}`));
    for (const row of existing) {
      const key = `${row.external_id}\0${row.layer_id || ""}`;
      if (!keep.has(key)) await query(db, "DELETE FROM project_design_resources WHERE id=?", [row.id]);
    }
    for (const item of normalized) {
      const key = `${item.fileId}\0${item.layerId}`;
      const found = byKey.get(key);
      if (found) {
        await query(db, `UPDATE project_design_resources
          SET label=?,resource_url=?,sort_order=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [item.label, item.resourceUrl, item.sortOrder, found.id]);
      } else {
        await query(db, `INSERT INTO project_design_resources
          (id,project_id,platform,external_id,layer_id,label,resource_url,meta_json,sort_order,created_by,updated_at)
          VALUES(?,?,?,?,?,?,?,NULL,?,?,UTC_TIMESTAMP(3))`,
          [randomUUID(), projectId, "mastergo", item.fileId, item.layerId, item.label, item.resourceUrl, item.sortOrder, user.id]);
      }
    }
  });
  return listProjectDesignConfig(service, user, projectId);
}

export async function agentListDesignSources(db, projectId) {
  const connectors = await query(db, `SELECT kind,enabled,token_ciphertext,token_hint,updated_at
    FROM project_code_connectors WHERE project_id=? AND kind='mastergo'`, [projectId]);
  const resources = await query(db, `SELECT id,platform,external_id,layer_id,label,resource_url,sort_order,updated_at
    FROM project_design_resources WHERE project_id=? AND platform='mastergo' ORDER BY sort_order,id`, [projectId]);
  const row = connectors[0] || null;
  return {
    policy: "只读。仅在任务确实需要对照设计稿，或人类成员明确要求查阅 MasterGo 时使用；不要把超大 DSL 贴进对成员可见正文。项目范围以已加入的设计稿为准。",
    connector: row ? {
      kind: "mastergo",
      enabled: !!Number(row.enabled),
      hasToken: !!row.token_ciphertext,
      tokenHint: row.token_hint || null,
      updatedAt: row.updated_at,
    } : {
      kind: "mastergo", enabled: false, hasToken: false, tokenHint: null, updatedAt: null,
    },
    files: resources.map(redactedDesignResource),
  };
}

async function getDesignResource(db, projectId, resourceId) {
  const [row] = await query(db, `SELECT * FROM project_design_resources
    WHERE id=? AND project_id=? AND platform='mastergo'`, [resourceId, projectId]);
  if (!row) throw new HttpError(404, "设计稿不在本项目 MasterGo 范围内");
  return row;
}

export async function agentReadDesignMeta(db, projectId, resourceId) {
  const row = await getDesignResource(db, projectId, resourceId);
  const token = await loadMastergoToken(db, projectId);
  if (!row.layer_id) throw new HttpError(400, "该设计稿未指定 layerId，请在范围中补充含 layer_id 的链接后再读取");
  const meta = await fetchMastergoJson("/mcp/meta", token, {
    fileId: row.external_id,
    layerId: row.layer_id,
  });
  return {
    resourceId: row.id,
    fileId: row.external_id,
    layerId: row.layer_id,
    label: row.label,
    meta,
  };
}

export async function agentReadDesignDsl(db, projectId, resourceId) {
  const row = await getDesignResource(db, projectId, resourceId);
  const token = await loadMastergoToken(db, projectId);
  if (!row.layer_id) throw new HttpError(400, "该设计稿未指定 layerId，请在范围中补充含 layer_id 的链接后再读取");
  const dsl = await fetchMastergoJson("/mcp/dsl", token, {
    fileId: row.external_id,
    layerId: row.layer_id,
  });
  const serialized = JSON.stringify(dsl);
  if (serialized.length > MAX_DSL_CHARS) {
    throw new HttpError(400, `DSL 过大（约 ${Math.round(serialized.length / 1024)}KB），请缩小选中图层后再读`);
  }
  return {
    resourceId: row.id,
    fileId: row.external_id,
    layerId: row.layer_id,
    label: row.label,
    dsl,
  };
}

export async function fetchMastergoMetaForProject(service, user, projectId, resourceId) {
  await service.member(user, projectId, false);
  return agentReadDesignMeta(service.db, projectId, resourceId);
}

export async function fetchMastergoDslForProject(service, user, projectId, resourceId) {
  await service.member(user, projectId, false);
  return agentReadDesignDsl(service.db, projectId, resourceId);
}
