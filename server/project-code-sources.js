import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { encryptToken, decryptToken } from "./credential-vault.js";
import { HttpError } from "./service.js";

const KIND = z.enum(["github", "yunxiao"]);
const GIT_KIND = KIND;
const vaultId = (projectId) => `project:${projectId}`;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TREE = 2000;
const MAX_SCOPE = 20;
const YUNXIAO_API_BASE = process.env.YUNXIAO_API_BASE_URL || "https://openapi-rdc.aliyuncs.com";

const KIND_LABEL = { github: "GitHub", yunxiao: "云效" };

function hintOf(secret) {
  const value = String(secret || "");
  if (!value) return null;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function normalizeRemoteUrl(url) {
  const trimmed = String(url || "").trim().replace(/\.git$/i, "");
  if (!/^https:\/\//i.test(trimmed) && !/^git@/i.test(trimmed)) {
    throw new HttpError(400, "代码仓库地址须为 https:// 或 git@ 形式");
  }
  return String(url).trim();
}

function hostOf(remoteUrl) {
  try {
    if (remoteUrl.startsWith("git@")) {
      const host = remoteUrl.slice(4).split(":")[0];
      return host.toLowerCase();
    }
    return new URL(remoteUrl).host.toLowerCase();
  } catch {
    return "";
  }
}

function platformForHost(host) {
  if (!host) return null;
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host.includes("codeup") || host.includes("aliyun") || host.includes("devops")) return "yunxiao";
  return null;
}

function remotePlatform(remote) {
  return remote.platform || platformForHost(hostOf(remote.remote_url));
}

function redactedRemote(row) {
  return {
    id: row.id,
    platform: row.platform || platformForHost(hostOf(row.remote_url)),
    externalId: row.external_id || null,
    label: row.label,
    remoteUrl: row.remote_url,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function redactedConnector(row) {
  return {
    kind: row.kind,
    enabled: !!Number(row.enabled),
    hasToken: !!row.token_ciphertext,
    tokenHint: row.token_hint || null,
    organizationId: row.organization_id || null,
    updatedAt: row.updated_at,
  };
}

async function loadConnectorRow(db, projectId, kind) {
  const [row] = await query(db, `SELECT id,kind,enabled,token_ciphertext,token_hint,organization_id,updated_at
    FROM project_code_connectors WHERE project_id=? AND kind=?`, [projectId, kind]);
  return row || null;
}

async function decryptConnectorToken(db, projectId, kind) {
  const row = await loadConnectorRow(db, projectId, kind);
  if (!row?.token_ciphertext) throw new HttpError(409, `请先保存 ${KIND_LABEL[kind] || kind} 连接器令牌`);
  if (!Number(row.enabled)) throw new HttpError(409, `请先启用 ${KIND_LABEL[kind] || kind} 连接器`);
  return { row, token: await decryptToken(row.token_ciphertext, vaultId(projectId)) };
}

export async function revealProjectCodeConnectorToken(service, user, projectId, kind) {
  await service.member(user, projectId, true, service.db, true);
  const parsedKind = KIND.parse(kind);
  const row = await loadConnectorRow(service.db, projectId, parsedKind);
  if (!row?.token_ciphertext) throw new HttpError(404, "尚未保存令牌");
  return {
    kind: parsedKind,
    token: await decryptToken(row.token_ciphertext, vaultId(projectId)),
    tokenHint: row.token_hint || null,
  };
}

export async function listProjectCodeConfig(service, user, projectId) {
  await service.member(user, projectId, false);
  const [connectors, remotes] = await Promise.all([
    query(service.db, `SELECT kind,enabled,token_ciphertext,token_hint,organization_id,updated_at
      FROM project_code_connectors WHERE project_id=? ORDER BY kind`, [projectId]),
    query(service.db, `SELECT id,platform,external_id,label,remote_url,sort_order,updated_at
      FROM project_git_remotes WHERE project_id=? ORDER BY sort_order,id`, [projectId]),
  ]);
  const byKind = Object.fromEntries(connectors.map((row) => [row.kind, redactedConnector(row)]));
  return {
    connectors: {
      github: byKind.github || {
        kind: "github", enabled: false, hasToken: false, tokenHint: null, organizationId: null, updatedAt: null,
      },
      yunxiao: byKind.yunxiao || {
        kind: "yunxiao", enabled: false, hasToken: false, tokenHint: null, organizationId: null, updatedAt: null,
      },
    },
    remotes: remotes.map(redactedRemote),
  };
}

export async function upsertProjectCodeConnector(service, user, projectId, input) {
  await service.member(user, projectId, true, service.db, true);
  const data = z.object({
    kind: KIND,
    enabled: z.boolean(),
    token: z.string().trim().min(1).max(4000).optional(),
    clearToken: z.boolean().optional(),
    organizationId: z.string().trim().max(128).nullable().optional(),
  }).parse(input);
  const [existing] = await query(service.db,
    "SELECT id,token_ciphertext,token_hint,organization_id FROM project_code_connectors WHERE project_id=? AND kind=?",
    [projectId, data.kind]);
  let tokenCipher = existing?.token_ciphertext || null;
  let tokenHint = existing?.token_hint || null;
  if (data.clearToken) {
    tokenCipher = null;
    tokenHint = null;
  } else if (data.token) {
    tokenCipher = await encryptToken(data.token, vaultId(projectId));
    tokenHint = hintOf(data.token);
  }
  if (data.enabled && !tokenCipher) throw new HttpError(400, "启用连接器前请先填写访问令牌");
  const organizationId = data.organizationId === undefined
    ? (existing?.organization_id || null)
    : (data.organizationId || null);
  const id = existing?.id || randomUUID();
  if (existing) {
    await query(service.db, `UPDATE project_code_connectors
      SET enabled=?,token_ciphertext=?,token_hint=?,organization_id=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [data.enabled ? 1 : 0, tokenCipher, tokenHint, organizationId, id]);
  } else {
    await query(service.db, `INSERT INTO project_code_connectors
      (id,project_id,kind,enabled,token_ciphertext,token_hint,organization_id,created_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,
      [id, projectId, data.kind, data.enabled ? 1 : 0, tokenCipher, tokenHint, organizationId, user.id]);
  }
  return listProjectCodeConfig(service, user, projectId);
}

async function fetchJson(url, headers) {
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new HttpError(400, `拉取仓库列表失败：网络错误 ${error?.message || error}`);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const detail = typeof body === "object" && body
      ? (body.message || body.errorMessage || body.errorCode || body.error || body.code
        || JSON.stringify(body).slice(0, 300))
      : String(text || response.statusText).slice(0, 300);
    throw new HttpError(400, `拉取仓库列表失败（HTTP ${response.status}）：${detail || "无详情"}`);
  }
  return { body, headers: response.headers };
}

function yunxiaoHeaders(token) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-yunxiao-token": token,
    Authorization: `Bearer ${token}`,
  };
}

async function resolveYunxiaoOrganizationId(token, preferred) {
  if (preferred) return preferred;
  const url = new URL("/oapi/v1/platform/organizations", YUNXIAO_API_BASE);
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "100");
  const { body } = await fetchJson(url.toString(), yunxiaoHeaders(token));
  const list = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  if (!list.length) {
    throw new HttpError(409, "未找到云效组织。请填写组织 ID（在云效组织管理 → 基本信息，或地址栏 /organization/ 后面那段）");
  }
  if (list.length === 1) {
    const only = list[0];
    return String(only.id || only.organizationId || only.orgId || "");
  }
  const names = list
    .map((item) => `${item.name || item.organizationName || "未命名"}(${item.id || item.organizationId || "?"})`)
    .slice(0, 8)
    .join("、");
  throw new HttpError(409,
    `检测到多个云效组织，请先填写组织 ID 再拉取。可选：${names}`);
}

async function listGitHubRepositories(token, search) {
  const items = [];
  const queryText = String(search || "").trim().toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");
    url.searchParams.set("sort", "updated");
    const { body } = await fetchJson(url.toString(), {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "cothread-code-scope",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const pageItems = Array.isArray(body) ? body : [];
    for (const repo of pageItems) {
      const label = repo.full_name || repo.name;
      const remoteUrl = repo.clone_url || repo.html_url;
      if (!label || !remoteUrl) continue;
      if (queryText && !String(label).toLowerCase().includes(queryText)
        && !String(repo.description || "").toLowerCase().includes(queryText)) continue;
      items.push({
        externalId: String(repo.id),
        label: String(label).slice(0, 128),
        remoteUrl: normalizeRemoteUrl(remoteUrl),
        description: repo.description || null,
        private: !!repo.private,
      });
    }
    if (pageItems.length < 100) break;
  }
  return items.slice(0, 500);
}

function yunxiaoCloneUrl(repo) {
  if (repo.httpUrlToRepo) return repo.httpUrlToRepo;
  if (repo.cloneUrl) return repo.cloneUrl;
  if (repo.pathWithNamespace) return `https://codeup.aliyun.com/${repo.pathWithNamespace}.git`;
  if (repo.webUrl) {
    const base = String(repo.webUrl).replace(/\/$/, "");
    return base.endsWith(".git") ? base : `${base}.git`;
  }
  return null;
}

function yunxiaoRepoLabel(repo) {
  const orgId = /^[a-f0-9]{16,}$/i;
  const stripOrg = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const spaced = text.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
    if (spaced.length > 1 && orgId.test(spaced[0])) return spaced.slice(1).join(" / ");
    const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 && orgId.test(parts[0])) return parts.slice(1).join("/");
    return text;
  };
  return stripOrg(repo.pathWithNamespace)
    || stripOrg(repo.nameWithNamespace)
    || String(repo.name || "").trim()
    || stripOrg(repo.pathWithNamespace || repo.nameWithNamespace);
}

async function listYunxiaoRepositories(token, organizationId, search) {
  const orgId = await resolveYunxiaoOrganizationId(token, organizationId);
  if (!orgId) {
    throw new HttpError(409, "请填写云效组织 ID（中心版必填）");
  }
  const items = [];
  const queryText = String(search || "").trim();
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(
      `/oapi/v1/codeup/organizations/${encodeURIComponent(orgId)}/repositories`,
      YUNXIAO_API_BASE,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", "100");
    url.searchParams.set("orderBy", "created_at");
    url.searchParams.set("sort", "desc");
    url.searchParams.set("archived", "false");
    if (queryText) url.searchParams.set("search", queryText);
    const { body, headers } = await fetchJson(url.toString(), yunxiaoHeaders(token));
    const pageItems = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
    for (const repo of pageItems) {
      const remoteUrl = yunxiaoCloneUrl(repo);
      const label = yunxiaoRepoLabel(repo);
      if (!label || !remoteUrl) continue;
      items.push({
        externalId: String(repo.id),
        label: String(label).slice(0, 128),
        remoteUrl: normalizeRemoteUrl(remoteUrl),
        description: repo.description || null,
        private: repo.visibility === "private",
      });
    }
    const totalPages = Number(headers.get("x-total-pages") || 0);
    if (pageItems.length < 100) break;
    if (totalPages && page >= totalPages) break;
  }
  return items.slice(0, 500);
}

export async function listPlatformRepositories(service, user, projectId, kind, { search } = {}) {
  await service.member(user, projectId, true, service.db, true);
  const parsedKind = GIT_KIND.parse(kind);
  const { row, token } = await decryptConnectorToken(service.db, projectId, parsedKind);
  const repositories = parsedKind === "github"
    ? await listGitHubRepositories(token, search)
    : await listYunxiaoRepositories(token, row.organization_id, search);
  const selected = await query(service.db,
    `SELECT external_id FROM project_git_remotes WHERE project_id=? AND platform=?`,
    [projectId, parsedKind]);
  const selectedIds = new Set(selected.map((item) => String(item.external_id || "")));
  return {
    kind: parsedKind,
    repositories: repositories.map((item) => ({
      ...item,
      selected: selectedIds.has(String(item.externalId)),
    })),
  };
}

export async function syncPlatformScope(service, user, projectId, kind, input) {
  await service.member(user, projectId, true, service.db, true);
  const parsedKind = GIT_KIND.parse(kind);
  await decryptConnectorToken(service.db, projectId, parsedKind);
  const data = z.object({
    repositories: z.array(z.object({
      externalId: z.string().trim().min(1).max(191),
      label: z.string().trim().min(1).max(128),
      remoteUrl: z.string().trim().min(1).max(1024),
    })).max(MAX_SCOPE),
  }).parse(input);
  if (data.repositories.length > MAX_SCOPE) {
    throw new HttpError(400, `每个平台最多勾选 ${MAX_SCOPE} 个代码仓库`);
  }
  const seen = new Set();
  const normalized = data.repositories.map((item, index) => {
    const externalId = item.externalId.trim();
    if (seen.has(externalId)) throw new HttpError(400, "勾选列表包含重复仓库");
    seen.add(externalId);
    return {
      externalId,
      label: item.label.trim(),
      remoteUrl: normalizeRemoteUrl(item.remoteUrl),
      sortOrder: index,
    };
  });
  await transaction(service.db, async (db) => {
    const existing = await query(db,
      `SELECT id,external_id FROM project_git_remotes WHERE project_id=? AND platform=?`,
      [projectId, parsedKind]);
    const byExternal = new Map(existing.map((row) => [String(row.external_id || ""), row]));
    const keep = new Set(normalized.map((item) => item.externalId));
    for (const row of existing) {
      if (!keep.has(String(row.external_id || ""))) {
        await query(db, "DELETE FROM project_git_remotes WHERE id=?", [row.id]);
      }
    }
    for (const item of normalized) {
      const found = byExternal.get(item.externalId);
      if (found) {
        await query(db, `UPDATE project_git_remotes
          SET label=?,remote_url=?,sort_order=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [item.label, item.remoteUrl, item.sortOrder, found.id]);
      } else {
        await query(db, `INSERT INTO project_git_remotes
          (id,project_id,platform,external_id,label,remote_url,credential_ciphertext,credential_hint,sort_order,created_by,updated_at)
          VALUES(?,?,?,?,?,?,NULL,NULL,?,?,UTC_TIMESTAMP(3))`,
          [randomUUID(), projectId, parsedKind, item.externalId, item.label, item.remoteUrl, item.sortOrder, user.id]);
      }
    }
  });
  return listProjectCodeConfig(service, user, projectId);
}

/** @deprecated Prefer syncPlatformScope; kept for tests/migrations of old flows. */
export async function createProjectGitRemote(service, user, projectId, input) {
  const data = z.object({
    label: z.string().trim().min(1).max(128),
    remoteUrl: z.string().trim().min(1).max(1024),
    platform: KIND.optional(),
    externalId: z.string().trim().min(1).max(191).optional(),
  }).parse(input);
  const remoteUrl = normalizeRemoteUrl(data.remoteUrl);
  const platform = data.platform || platformForHost(hostOf(remoteUrl));
  if (!platform) throw new HttpError(400, "无法识别仓库所属平台，请使用 GitHub 或云效地址");
  return syncPlatformScope(service, user, projectId, platform, {
    repositories: [
      ...(await listProjectCodeConfig(service, user, projectId)).remotes
        .filter((item) => item.platform === platform)
        .map((item) => ({
          externalId: item.externalId || item.id,
          label: item.label,
          remoteUrl: item.remoteUrl,
        })),
      {
        externalId: data.externalId || `manual:${remoteUrl}`,
        label: data.label,
        remoteUrl,
      },
    ],
  });
}

export async function deleteProjectGitRemote(service, user, projectId, remoteId) {
  await service.member(user, projectId, true, service.db, true);
  const result = await query(service.db,
    "DELETE FROM project_git_remotes WHERE id=? AND project_id=?", [remoteId, projectId]);
  if (!result.affectedRows) throw new HttpError(404, "代码仓库不存在");
  return listProjectCodeConfig(service, user, projectId);
}

/** 保留：本地调试镜像路径；只读工具已改走平台 API，不再 spawn git。 */
export function codeMirrorBase() {
  return process.env.COTHREAD_MAKERS === "true"
    ? resolve(tmpdir(), "cothread-code-mirrors")
    : resolve(".local", "code-mirrors");
}

function redactGitDetail(text) {
  return String(text || "")
    .replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1$2:***@")
    .replace(/\b(x-access-token|oauth2):[^\s@]+@/gi, "$1:***@");
}

export function formatGitFailure(result) {
  const parts = [
    result?.stderr,
    result?.stdout,
    result?.error?.message,
    result?.signal ? `signal ${result.signal}` : "",
    result?.status != null && result.status !== 0 ? `exit ${result.status}` : "",
  ].map((part) => String(part || "").trim()).filter(Boolean);
  const detail = redactGitDetail(parts.join(" | ") || "git 失败").slice(0, 500);
  return `读取代码库失败：${detail}`;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "cothread-code-scope",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function parseGithubOwnerRepo(remoteUrl, label) {
  try {
    if (String(remoteUrl || "").startsWith("git@")) {
      const path = String(remoteUrl).split(":")[1] || "";
      const parts = path.replace(/\.git$/i, "").split("/").filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    } else if (remoteUrl) {
      const parts = new URL(remoteUrl).pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    }
  } catch { /* fall through */ }
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  throw new HttpError(400, "无法解析 GitHub 仓库 owner/repo");
}

function githubRepoApiBase(remote) {
  if (remote.external_id) return `https://api.github.com/repositories/${encodeURIComponent(remote.external_id)}`;
  const { owner, repo } = parseGithubOwnerRepo(remote.remote_url, remote.label);
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function normalizeRefParam(ref) {
  const value = String(ref || "").trim();
  if (!value || value === "HEAD") return null;
  return value;
}

async function fetchCodeJson(url, headers) {
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new HttpError(400, `读取代码库失败：网络错误 ${error?.message || error}`);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const detail = typeof body === "object" && body
      ? (body.message || body.errorMessage || body.errorCode || body.error || body.code
        || JSON.stringify(body).slice(0, 300))
      : String(text || response.statusText).slice(0, 300);
    throw new HttpError(400, `读取代码库失败（HTTP ${response.status}）：${redactGitDetail(detail || "无详情")}`);
  }
  return { body, headers: response.headers };
}

async function requireRemoteAccess(db, projectId, remote) {
  const platform = remotePlatform(remote);
  if (!platform) throw new HttpError(409, "无法识别仓库所属平台，请使用 GitHub 或云效地址");
  const { row, token } = await decryptConnectorToken(db, projectId, platform);
  return { platform, token, connector: row };
}

async function githubListRefs(token, remote) {
  const base = githubRepoApiBase(remote);
  const refs = [];
  for (const kind of ["heads", "tags"]) {
    const { body } = await fetchCodeJson(`${base}/git/matching-refs/${kind}`, githubHeaders(token));
    for (const item of Array.isArray(body) ? body : []) {
      if (!item?.ref || !item?.object?.sha) continue;
      refs.push({ sha: item.object.sha, ref: item.ref });
      if (refs.length >= 200) return refs;
    }
  }
  return refs;
}

async function githubListTree(token, remote, { ref, path = "" } = {}) {
  const base = githubRepoApiBase(remote);
  const prefix = String(path || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const encoded = prefix.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = new URL(`${base}/contents${encoded ? `/${encoded}` : ""}`);
  const normalized = normalizeRefParam(ref);
  if (normalized) url.searchParams.set("ref", normalized);
  const { body } = await fetchCodeJson(url.toString(), githubHeaders(token));
  if (!Array.isArray(body)) {
    throw new HttpError(400, "读取代码库失败：目标路径不是目录");
  }
  const entries = [];
  for (const item of body) {
    entries.push({
      type: item.type === "dir" ? "dir" : "file",
      path: item.path || item.name,
      size: item.type === "dir" ? null : (Number.isFinite(Number(item.size)) ? Number(item.size) : null),
    });
    if (entries.length >= MAX_TREE) break;
  }
  return entries;
}

async function githubReadFile(token, remote, { ref, path } = {}) {
  const base = githubRepoApiBase(remote);
  const encoded = String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = new URL(`${base}/contents/${encoded}`);
  const normalized = normalizeRefParam(ref);
  if (normalized) url.searchParams.set("ref", normalized);
  const { body } = await fetchCodeJson(url.toString(), githubHeaders(token));
  if (Array.isArray(body) || body?.type === "dir") {
    throw new HttpError(400, "目标路径是目录，请改用查看目录");
  }
  if (!body || body.type !== "file") throw new HttpError(404, "文件不存在或无法读取");
  const size = Number(body.size);
  if (!Number.isFinite(size)) throw new HttpError(400, "无法读取文件大小");
  if (size > MAX_FILE_BYTES) {
    throw new HttpError(400, `文件超过 ${MAX_FILE_BYTES} 字节只读上限，请改用更小的路径或让成员提供摘录`);
  }
  if (body.encoding && body.encoding !== "base64") {
    throw new HttpError(400, `不支持的文件编码：${body.encoding}`);
  }
  const raw = Buffer.from(String(body.content || "").replace(/\s+/g, ""), "base64");
  if (raw.includes(0)) throw new HttpError(400, "该路径是二进制文件，只读接口仅支持文本");
  return { byteSize: size, content: raw.toString("utf8").slice(0, MAX_FILE_BYTES) };
}

async function yunxiaoRepoContext(db, projectId, remote, token, connector) {
  const orgId = await resolveYunxiaoOrganizationId(token, connector.organization_id);
  const repositoryId = remote.external_id
    || (() => {
      try {
        const path = new URL(remote.remote_url).pathname.replace(/^\//, "").replace(/\.git$/i, "");
        return path || null;
      } catch {
        return remote.label || null;
      }
    })();
  if (!repositoryId) throw new HttpError(400, "云效仓库缺少 externalId，请重新同步仓库范围");
  return { orgId, repositoryId: String(repositoryId) };
}

function yunxiaoRepoUrl(orgId, repositoryId, suffix) {
  return new URL(
    `/oapi/v1/codeup/organizations/${encodeURIComponent(orgId)}/repositories/${encodeURIComponent(repositoryId)}${suffix}`,
    YUNXIAO_API_BASE,
  );
}

async function yunxiaoPaged(url, token, mapItem) {
  const items = [];
  for (let page = 1; page <= 10; page += 1) {
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", "100");
    const { body, headers } = await fetchCodeJson(url.toString(), yunxiaoHeaders(token));
    const pageItems = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
    for (const item of pageItems) {
      const mapped = mapItem(item);
      if (mapped) items.push(mapped);
      if (items.length >= 200) return items;
    }
    const totalPages = Number(headers.get("x-total-pages") || 0);
    if (pageItems.length < 100) break;
    if (totalPages && page >= totalPages) break;
  }
  return items;
}

async function yunxiaoListRefs(token, { orgId, repositoryId }) {
  const branches = await yunxiaoPaged(
    yunxiaoRepoUrl(orgId, repositoryId, "/branches"),
    token,
    (item) => {
      const name = item.name || item.branchName;
      const sha = item.commit?.id || item.commitId || item.id;
      if (!name || !sha) return null;
      return { sha, ref: `refs/heads/${name}` };
    },
  );
  const tags = await yunxiaoPaged(
    yunxiaoRepoUrl(orgId, repositoryId, "/tags"),
    token,
    (item) => {
      const name = item.name || item.tagName;
      const sha = item.commit?.id || item.id;
      if (!name || !sha) return null;
      return { sha, ref: `refs/tags/${name}` };
    },
  );
  return [...branches, ...tags].slice(0, 200);
}

async function yunxiaoDefaultRef(token, { orgId, repositoryId }) {
  const url = yunxiaoRepoUrl(orgId, repositoryId, "/branches");
  url.searchParams.set("page", "1");
  url.searchParams.set("perPage", "100");
  const { body } = await fetchCodeJson(url.toString(), yunxiaoHeaders(token));
  const list = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  const preferred = list.find((item) => item.defaultBranch)?.name
    || list[0]?.name
    || list[0]?.branchName;
  return preferred || "master";
}

async function yunxiaoListTree(token, ctx, { ref, path = "" } = {}) {
  const url = yunxiaoRepoUrl(ctx.orgId, ctx.repositoryId, "/files/tree");
  const prefix = String(path || "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (prefix) url.searchParams.set("path", prefix);
  const normalized = normalizeRefParam(ref) || await yunxiaoDefaultRef(token, ctx);
  url.searchParams.set("ref", normalized);
  url.searchParams.set("type", "DIRECT");
  const { body } = await fetchCodeJson(url.toString(), yunxiaoHeaders(token));
  const list = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  const entries = [];
  for (const item of list) {
    entries.push({
      type: item.type === "tree" ? "dir" : "file",
      path: item.path || (prefix ? `${prefix}/${item.name}` : item.name),
      size: null,
    });
    if (entries.length >= MAX_TREE) break;
  }
  return entries;
}

async function yunxiaoReadFile(token, ctx, { ref, path } = {}) {
  // 云效要求整段路径 URL-Encode（斜杠变成 %2F），而不是按段拆开。
  const url = yunxiaoRepoUrl(ctx.orgId, ctx.repositoryId, `/files/${encodeURIComponent(path)}`);
  const normalized = normalizeRefParam(ref) || await yunxiaoDefaultRef(token, ctx);
  url.searchParams.set("ref", normalized);
  const { body } = await fetchCodeJson(url.toString(), yunxiaoHeaders(token));
  const size = Number(body?.size);
  if (!Number.isFinite(size)) throw new HttpError(400, "无法读取文件大小");
  if (size > MAX_FILE_BYTES) {
    throw new HttpError(400, `文件超过 ${MAX_FILE_BYTES} 字节只读上限，请改用更小的路径或让成员提供摘录`);
  }
  const encoding = String(body?.encoding || "base64").toLowerCase();
  let raw;
  if (encoding === "base64") {
    raw = Buffer.from(String(body.content || "").replace(/\s+/g, ""), "base64");
  } else if (encoding === "text") {
    raw = Buffer.from(String(body.content || ""), "utf8");
  } else {
    throw new HttpError(400, `不支持的文件编码：${encoding}`);
  }
  if (raw.includes(0)) throw new HttpError(400, "该路径是二进制文件，只读接口仅支持文本");
  return { byteSize: size, content: raw.toString("utf8").slice(0, MAX_FILE_BYTES) };
}

export async function agentListCodeSources(db, projectId) {
  const [connectors, remotes] = await Promise.all([
    query(db, `SELECT kind,enabled,token_ciphertext,token_hint,organization_id,updated_at
      FROM project_code_connectors WHERE project_id=?`, [projectId]),
    query(db, `SELECT id,platform,external_id,label,remote_url,sort_order,updated_at
      FROM project_git_remotes WHERE project_id=? ORDER BY sort_order,id`, [projectId]),
  ]);
  const byKind = Object.fromEntries(connectors.map((row) => [row.kind, redactedConnector(row)]));
  return {
    policy: "只读。仅在任务确实需要对照源码，或人类成员明确要求查阅代码库时使用；不要浏览无关目录或大段粘贴源码。项目范围以已勾选仓库为准。",
    connectors: {
      github: byKind.github || {
        kind: "github", enabled: false, hasToken: false, tokenHint: null, organizationId: null, updatedAt: null,
      },
      yunxiao: byKind.yunxiao || {
        kind: "yunxiao", enabled: false, hasToken: false, tokenHint: null, organizationId: null, updatedAt: null,
      },
    },
    remotes: remotes.map((row) => ({
      id: row.id,
      platform: row.platform || platformForHost(hostOf(row.remote_url)),
      externalId: row.external_id || null,
      label: row.label,
      remoteUrl: row.remote_url,
    })),
  };
}

async function getRemoteRow(db, projectId, remoteId) {
  const [row] = await query(db, "SELECT * FROM project_git_remotes WHERE id=? AND project_id=?",
    [remoteId, projectId]);
  if (!row) throw new HttpError(404, "代码仓库不存在");
  return row;
}

export async function agentListCodeRefs(db, projectId, remoteId) {
  const remote = await getRemoteRow(db, projectId, remoteId);
  const { platform, token, connector } = await requireRemoteAccess(db, projectId, remote);
  const refs = platform === "github"
    ? await githubListRefs(token, remote)
    : await yunxiaoListRefs(token, await yunxiaoRepoContext(db, projectId, remote, token, connector));
  return { remoteId, label: remote.label, refs };
}

export async function agentListCodeTree(db, projectId, remoteId, { ref, path = "" } = {}) {
  const remote = await getRemoteRow(db, projectId, remoteId);
  const { platform, token, connector } = await requireRemoteAccess(db, projectId, remote);
  const prefix = String(path || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const entries = platform === "github"
    ? await githubListTree(token, remote, { ref, path: prefix })
    : await yunxiaoListTree(
      token,
      await yunxiaoRepoContext(db, projectId, remote, token, connector),
      { ref, path: prefix },
    );
  return { remoteId, label: remote.label, ref: ref || "HEAD", path: prefix || "", entries };
}

export async function agentReadCodeFile(db, projectId, remoteId, { ref, path } = {}) {
  const filePath = String(path || "").replace(/^\/+/, "");
  if (!filePath || filePath.includes("\0") || filePath.split("/").includes("..")) {
    throw new HttpError(400, "非法文件路径");
  }
  const remote = await getRemoteRow(db, projectId, remoteId);
  const { platform, token, connector } = await requireRemoteAccess(db, projectId, remote);
  const file = platform === "github"
    ? await githubReadFile(token, remote, { ref, path: filePath })
    : await yunxiaoReadFile(
      token,
      await yunxiaoRepoContext(db, projectId, remote, token, connector),
      { ref, path: filePath },
    );
  return {
    remoteId,
    label: remote.label,
    ref: ref || "HEAD",
    path: filePath,
    byteSize: file.byteSize,
    content: file.content,
  };
}
