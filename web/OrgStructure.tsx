import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminDialog } from "./AdminDialog";
import { DialogFooter } from "./DialogFooter";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import type { WorkspaceApi } from "./workspace-api";

type OrgSummary = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  childCount: number;
  primaryCount: number;
  hostCount: number;
};

type Member = {
  userId: string;
  name: string;
  username: string;
  disabledAt: string | null;
  kind: string;
};

type OrgProject = {
  projectId: string;
  name: string;
  role: string;
  scope: string;
};

type UserChoice = {
  id: string;
  name: string;
  username: string;
  disabledAt: string | null;
  primaryOrgId: string | null;
};

type ProjectChoice = {
  id: string;
  name: string;
  archivedAt: string | null;
  hostOrgId: string | null;
  scope: string;
};

type OrgDetail = {
  org?: {
    id?: string;
    parentId?: string | null;
    name?: string;
    archivedAt?: string | null;
  };
  members: Member[];
  projects: OrgProject[];
  users: UserChoice[];
  projectChoices: ProjectChoice[];
};

type LinkAction =
  "set-host" | "replace-host" | "clear-host" | "add-participant" | "remove-participant";

type Overlay =
  | { kind: "create"; name: string; parentId: string }
  | { kind: "rename"; name: string }
  | { kind: "move"; parentId: string }
  | { kind: "primary" }
  | { kind: "secondary" }
  | { kind: "project"; action: LinkAction }
  | {
      kind: "confirm-member";
      mode: "primary" | "secondary" | "remove";
      userId: string;
      back: "primary" | "secondary" | null;
    }
  | { kind: "confirm-project"; action: LinkAction; projectId: string; back: boolean }
  | { kind: "confirm-archive" };

const linkLabel: Record<LinkAction, string> = {
  "set-host": "设主办",
  "replace-host": "更换主办",
  "clear-host": "撤下主办",
  "add-participant": "添加参与",
  "remove-participant": "撤下参与",
};

const scopeLabel = (scope: string) => {
  if (scope === "independent") return "独立";
  if (scope === "cross") return "跨组织";
  if (scope === "unassigned") return "未归属";
  return scope;
};

const roleLabel = (role: string) => {
  if (role === "host") return "主办";
  if (role === "participant") return "参与";
  return role;
};

const kindLabel = (kind: string) => {
  if (kind === "primary") return "主组织";
  if (kind === "secondary") return "兼岗";
  return kind;
};

const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const readId = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const row = value as { id?: unknown; orgId?: unknown; org?: { id?: unknown } };
  if (typeof row.org?.id === "string") return row.org.id;
  if (typeof row.id === "string") return row.id;
  if (typeof row.orgId === "string") return row.orgId;
  return "";
};

const asOrg = (value: unknown): OrgSummary => {
  const row = (value || {}) as Partial<OrgSummary>;
  return {
    id: String(row.id || ""),
    parentId: row.parentId ? String(row.parentId) : null,
    name: String(row.name || "未命名组织"),
    sortOrder: Number(row.sortOrder) || 0,
    archivedAt: row.archivedAt ? String(row.archivedAt) : null,
    childCount: Number(row.childCount) || 0,
    primaryCount: Number(row.primaryCount) || 0,
    hostCount: Number(row.hostCount) || 0,
  };
};

const orderedOrgs = (orgs: OrgSummary[]) => {
  const ids = new Set(orgs.map((org) => org.id));
  const byParent = new Map<string, OrgSummary[]>();
  for (const org of orgs) {
    const key = org.parentId && ids.has(org.parentId) ? org.parentId : "";
    const list = byParent.get(key) ?? [];
    list.push(org);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  }
  const rows: { org: OrgSummary; depth: number }[] = [];
  const walk = (parent: string, depth: number, seen: Set<string>) => {
    for (const org of byParent.get(parent) ?? []) {
      if (seen.has(org.id)) continue;
      seen.add(org.id);
      rows.push({ org, depth });
      walk(org.id, depth + 1, seen);
    }
  };
  walk("", 0, new Set());
  return rows;
};

const blockedParentIds = (orgs: OrgSummary[], id: string) => {
  const rows = orderedOrgs(orgs);
  const banned = new Set<string>([id]);
  let depth = -1;
  for (const row of rows) {
    if (row.org.id === id) {
      depth = row.depth;
      continue;
    }
    if (depth < 0) continue;
    if (row.depth > depth) banned.add(row.org.id);
    else break;
  }
  return banned;
};

const orgPath = (orgs: OrgSummary[], id: string) => {
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.archivedAt ? `${current.name}（已归档）` : current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ");
};

const matchesText = (query: string, parts: string[]) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.join(" ").toLowerCase().includes(needle);
};

export function OrgStructure({ api, permissions }: { api: WorkspaceApi; permissions: string[] }) {
  const canRead = permissions.includes("orgs");
  const canUpdate = permissions.includes("orgs.update");
  const canAssign = permissions.includes("orgs.assign");
  const canLink = permissions.includes("orgs.link");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const selectedIdRef = useRef("");
  const requestId = useRef(0);
  const updateTitle = canUpdate ? undefined : "没有调整组织的权限";
  const assignTitle = canAssign ? undefined : "没有调整人员的权限";
  const linkTitle = canLink ? undefined : "没有调整项目归属的权限";

  const reload = useCallback(
    async (focusId?: string) => {
      const mine = ++requestId.current;
      const data = (await api("/admin/orgs")) as { orgs?: unknown[] };
      if (requestId.current !== mine) return;
      const list = (Array.isArray(data.orgs) ? data.orgs : []).map(asOrg).filter((org) => org.id);
      setOrgs(list);
      const focus = focusId ?? selectedIdRef.current;
      if (!focus || !list.some((org) => org.id === focus)) {
        selectedIdRef.current = "";
        setSelectedId("");
        setDetail(null);
        setDetailError("");
        return;
      }
      selectedIdRef.current = focus;
      setSelectedId(focus);
      try {
        const next = (await api(`/admin/orgs/${encodeURIComponent(focus)}`)) as OrgDetail;
        if (requestId.current !== mine) return;
        setDetail(next);
        setDetailError("");
      } catch (cause) {
        if (requestId.current !== mine) return;
        setDetail(null);
        setDetailError(errorText(cause));
      }
    },
    [api],
  );

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void api("/admin/orgs")
      .then((data: { orgs?: unknown[] }) => {
        if (cancelled) return;
        setOrgs((Array.isArray(data.orgs) ? data.orgs : []).map(asOrg).filter((org) => org.id));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorText(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, canRead]);

  const rows = useMemo(() => orderedOrgs(orgs), [orgs]);
  const selected = orgs.find((org) => org.id === selectedId) || null;
  const orgName = detail?.org?.name || selected?.name || "";
  const archivedAt = detail?.org?.archivedAt ?? selected?.archivedAt ?? null;
  const parentId = detail?.org?.parentId ?? selected?.parentId ?? null;

  const openOrg = (id: string) => {
    const mine = ++requestId.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setError("");
    void api(`/admin/orgs/${encodeURIComponent(id)}`)
      .then((next: OrgDetail) => {
        if (requestId.current === mine) setDetail(next);
      })
      .catch((cause: unknown) => {
        if (requestId.current === mine) setDetailError(errorText(cause));
      });
  };

  const openOverlay = (next: Overlay) => {
    setQuery("");
    setError("");
    setOverlay(next);
  };

  const commit = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      const created = readId(result);
      setOverlay(null);
      showTip(success);
      try {
        await reload(created || selectedIdRef.current);
      } catch (cause) {
        setError(errorText(cause));
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const memberOf = (userId: string) => detail?.members.find((member) => member.userId === userId);
  const userOf = (userId: string) => detail?.users.find((user) => user.id === userId);
  const personName = (userId: string) => memberOf(userId)?.name || userOf(userId)?.name || "该账号";
  const projectName = (projectId: string) =>
    detail?.projects.find((project) => project.projectId === projectId)?.name ||
    detail?.projectChoices.find((project) => project.id === projectId)?.name ||
    "该项目";

  const primaryMessage = (userId: string) => {
    const name = personName(userId);
    const currentPrimary = userOf(userId)?.primaryOrgId;
    if (currentPrimary && currentPrimary !== selectedId) {
      const previous = orgs.find((org) => org.id === currentPrimary)?.name || "其他组织";
      return `「${name}」的主组织已经是「${previous}」。不能直接改到「${orgName}」，请先从原组织移出。`;
    }
    return `将「${name}」的主组织设为「${orgName}」？`;
  };

  const secondaryMessage = (userId: string) => {
    const name = personName(userId);
    return memberOf(userId)?.kind === "primary"
      ? `将「${name}」在「${orgName}」从主组织改为兼岗？`
      : `将「${name}」在「${orgName}」设为兼岗？`;
  };

  const projectMessage = (action: LinkAction, projectId: string) => {
    const name = projectName(projectId);
    if (action === "set-host") return `将「${name}」的主办组织设为「${orgName}」？`;
    if (action === "replace-host")
      return `将「${name}」的主办组织更换为「${orgName}」？这会替换其当前主办。`;
    if (action === "clear-host") return `撤下「${orgName}」作为「${name}」的主办组织？`;
    if (action === "add-participant") return `添加「${orgName}」为「${name}」的参与组织？`;
    return `撤下「${orgName}」对「${name}」的参与？`;
  };

  const parentOptions = (exclude?: Set<string>) => [
    { value: "", label: "作为顶级组织" },
    ...rows
      .filter((row) => !exclude?.has(row.org.id))
      .map((row) => ({ value: row.org.id, label: orgPath(orgs, row.org.id) })),
  ];

  const primaryCandidates = (detail?.users || []).filter(
    (user) =>
      !user.disabledAt && user.primaryOrgId !== selectedId && memberOf(user.id)?.kind !== "primary",
  );
  const secondaryCandidates = (detail?.users || []).filter(
    (user) => memberOf(user.id)?.kind !== "secondary",
  );

  const projectRows = (action: LinkAction) => {
    const projects = detail?.projects || [];
    const choices = detail?.projectChoices || [];
    if (action === "clear-host") {
      return projects
        .filter((project) => project.role === "host")
        .map((project) => ({
          id: project.projectId,
          name: project.name,
          scope: project.scope,
          archivedAt: choices.find((choice) => choice.id === project.projectId)?.archivedAt || null,
          extra: "",
        }));
    }
    if (action === "remove-participant") {
      return projects
        .filter((project) => project.role === "participant")
        .map((project) => ({
          id: project.projectId,
          name: project.name,
          scope: project.scope,
          archivedAt: choices.find((choice) => choice.id === project.projectId)?.archivedAt || null,
          extra: "",
        }));
    }
    if (action === "set-host") {
      return choices
        .filter((project) => !project.hostOrgId)
        .map((project) => ({
          id: project.id,
          name: project.name,
          scope: project.scope,
          archivedAt: project.archivedAt,
          extra: "",
        }));
    }
    if (action === "replace-host") {
      return choices
        .filter((project) => project.hostOrgId && project.hostOrgId !== selectedId)
        .map((project) => ({
          id: project.id,
          name: project.name,
          scope: project.scope,
          archivedAt: project.archivedAt,
          extra: `当前主办：${orgs.find((org) => org.id === project.hostOrgId)?.name || "其他组织"}`,
        }));
    }
    const participating = new Set(
      projects
        .filter((project) => project.role === "participant")
        .map((project) => project.projectId),
    );
    return choices
      .filter((project) => !participating.has(project.id))
      .map((project) => ({
        id: project.id,
        name: project.name,
        scope: project.scope,
        archivedAt: project.archivedAt,
        extra: "",
      }));
  };

  const saveMember = (mode: "primary" | "secondary" | "remove", userId: string) =>
    commit(
      async () => {
        await api(
          `/admin/orgs/${encodeURIComponent(selectedId)}/members`,
          { userId, kind: mode === "remove" ? null : mode },
          "PUT",
        );
      },
      mode === "primary" ? "主组织已更新" : mode === "secondary" ? "兼岗已更新" : "已移出组织",
    );

  const saveProject = (action: LinkAction, projectId: string) =>
    commit(async () => {
      await api(
        `/admin/projects/${encodeURIComponent(projectId)}/org-links`,
        { action, orgId: selectedId },
        "POST",
      );
    }, `已${linkLabel[action]}`);

  if (!canRead) {
    return (
      <section className="org-structure">
        <p className="org-structure-empty">没有组织架构的读取权限，因此不显示组织数据。</p>
      </section>
    );
  }

  const visiblePrimary = primaryCandidates.filter((user) =>
    matchesText(query, [user.name, user.username]),
  );
  const visibleSecondary = secondaryCandidates.filter((user) =>
    matchesText(query, [user.name, user.username]),
  );

  return (
    <section className="org-structure" aria-busy={loading || busy}>
      {error && !overlay && (
        <p role="alert" className="error org-structure-error">
          {error}
        </p>
      )}
      <div className="org-structure-panes">
        <aside className="org-structure-tree" aria-label="组织树">
          <div className="org-structure-toolbar">
            <strong>组织</strong>
            <button
              type="button"
              className="primary"
              disabled={!canUpdate || busy}
              title={updateTitle}
              onClick={() => openOverlay({ kind: "create", name: "", parentId: selectedId || "" })}
            >
              <UiIcon name="plus" size={13} />
              新增组织
            </button>
          </div>
          <div className="org-structure-nodes">
            {loading && (
              <p className="org-structure-empty" role="status">
                正在读取组织…
              </p>
            )}
            {!loading && !orgs.length && (
              <p className="org-structure-empty">还没有组织。旧项目不需要归属也能用。</p>
            )}
            {rows.map(({ org, depth }) => (
              <button
                key={org.id}
                type="button"
                className={`org-structure-node${org.id === selectedId ? " is-selected" : ""}${org.archivedAt ? " is-archived" : ""}`}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                aria-current={org.id === selectedId ? "true" : undefined}
                title={`${org.name}${org.archivedAt ? "，已归档" : ""}，主组织 ${org.primaryCount}，主办 ${org.hostCount}`}
                onClick={() => openOrg(org.id)}
              >
                <span className="org-structure-node-name">{org.name}</span>
                {org.archivedAt && <span className="org-structure-archived">已归档</span>}
              </button>
            ))}
          </div>
        </aside>
        <div className="org-structure-detail">
          {!selected && <p className="org-structure-empty">选择左侧组织后，可以查看人员和项目。</p>}
          {selected && (
            <>
              <div className="org-structure-heading">
                <div>
                  <h2>
                    {orgName}
                    {archivedAt && <span className="status-badge">已归档</span>}
                  </h2>
                  <p>
                    主组织{" "}
                    {detail
                      ? detail.members.filter((member) => member.kind === "primary").length
                      : selected.primaryCount}{" "}
                    人 · 主办项目{" "}
                    {detail
                      ? detail.projects.filter((project) => project.role === "host").length
                      : selected.hostCount}{" "}
                    个 · 下级 {selected.childCount}
                  </p>
                </div>
                <div className="org-structure-actions">
                  <button
                    type="button"
                    disabled={!canUpdate || busy}
                    title={updateTitle}
                    onClick={() => openOverlay({ kind: "rename", name: orgName })}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    disabled={!canUpdate || busy}
                    title={updateTitle}
                    onClick={() => openOverlay({ kind: "move", parentId: parentId || "" })}
                  >
                    移动
                  </button>
                  <button
                    type="button"
                    disabled={!canUpdate || busy || !!archivedAt}
                    title={archivedAt ? "组织已归档" : updateTitle}
                    onClick={() => openOverlay({ kind: "confirm-archive" })}
                  >
                    归档
                  </button>
                </div>
              </div>
              <div className="org-structure-scroll">
                {detailError && (
                  <p role="alert" className="error org-structure-error">
                    {detailError}
                  </p>
                )}
                {selectedId && !detail && !detailError && (
                  <p className="org-structure-empty" role="status">
                    正在读取组织…
                  </p>
                )}
                {detail && (
                  <>
                    <section className="org-structure-section" aria-label="人员">
                      <div className="org-structure-section-head">
                        <h3>人员</h3>
                        <div className="org-structure-actions">
                          <button
                            type="button"
                            disabled={!canAssign || busy}
                            title={assignTitle}
                            onClick={() => openOverlay({ kind: "primary" })}
                          >
                            设主组织
                          </button>
                          <button
                            type="button"
                            disabled={!canAssign || busy}
                            title={assignTitle}
                            onClick={() => openOverlay({ kind: "secondary" })}
                          >
                            设兼岗
                          </button>
                        </div>
                      </div>
                      <div className="org-structure-table">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>成员</th>
                              <th>关系</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.members.map((member) => (
                              <tr key={member.userId}>
                                <td>
                                  <strong>{member.name}</strong>
                                  <small>
                                    {member.username}
                                    {member.disabledAt ? " · 已停用" : ""}
                                  </small>
                                </td>
                                <td>{kindLabel(member.kind)}</td>
                                <td>
                                  <div className="admin-table-actions">
                                    <button
                                      type="button"
                                      disabled={
                                        !canAssign ||
                                        busy ||
                                        member.kind === "primary" ||
                                        !!member.disabledAt
                                      }
                                      title={
                                        !canAssign
                                          ? assignTitle
                                          : member.disabledAt
                                            ? "已停用的账号不能设为主组织"
                                            : member.kind === "primary"
                                              ? "已是主组织"
                                              : undefined
                                      }
                                      onClick={() =>
                                        openOverlay({
                                          kind: "confirm-member",
                                          mode: "primary",
                                          userId: member.userId,
                                          back: null,
                                        })
                                      }
                                    >
                                      设主组织
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canAssign || busy || member.kind === "secondary"}
                                      title={
                                        !canAssign
                                          ? assignTitle
                                          : member.kind === "secondary"
                                            ? "已是兼岗"
                                            : undefined
                                      }
                                      onClick={() =>
                                        openOverlay({
                                          kind: "confirm-member",
                                          mode: "secondary",
                                          userId: member.userId,
                                          back: null,
                                        })
                                      }
                                    >
                                      设兼岗
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canAssign || busy}
                                      title={assignTitle}
                                      onClick={() =>
                                        openOverlay({
                                          kind: "confirm-member",
                                          mode: "remove",
                                          userId: member.userId,
                                          back: null,
                                        })
                                      }
                                    >
                                      移出
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!detail.members.length && (
                              <tr>
                                <td colSpan={3} className="admin-empty">
                                  这个组织还没有人员
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="org-structure-section" aria-label="项目">
                      <div className="org-structure-section-head">
                        <h3>项目</h3>
                        <div className="org-structure-actions">
                          {(Object.keys(linkLabel) as LinkAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={!canLink || busy}
                              title={linkTitle}
                              onClick={() => openOverlay({ kind: "project", action })}
                            >
                              {linkLabel[action]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="org-structure-table">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>项目</th>
                              <th>关系</th>
                              <th>范围</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.projects.map((project) => {
                              const choice = detail.projectChoices.find(
                                (item) => item.id === project.projectId,
                              );
                              return (
                                <tr key={project.projectId}>
                                  <td>
                                    <strong>{project.name}</strong>
                                    {choice?.archivedAt && <small>已归档</small>}
                                  </td>
                                  <td>{roleLabel(project.role)}</td>
                                  <td>{scopeLabel(project.scope)}</td>
                                  <td>
                                    <div className="admin-table-actions">
                                      {project.role === "participant" &&
                                        choice &&
                                        !choice.hostOrgId && (
                                          <button
                                            type="button"
                                            disabled={!canLink || busy}
                                            title={linkTitle}
                                            onClick={() =>
                                              openOverlay({
                                                kind: "confirm-project",
                                                action: "set-host",
                                                projectId: project.projectId,
                                                back: false,
                                              })
                                            }
                                          >
                                            设主办
                                          </button>
                                        )}
                                      {project.role === "participant" &&
                                        choice?.hostOrgId &&
                                        choice.hostOrgId !== selectedId && (
                                          <button
                                            type="button"
                                            disabled={!canLink || busy}
                                            title={linkTitle}
                                            onClick={() =>
                                              openOverlay({
                                                kind: "confirm-project",
                                                action: "replace-host",
                                                projectId: project.projectId,
                                                back: false,
                                              })
                                            }
                                          >
                                            更换主办
                                          </button>
                                        )}
                                      {project.role === "host" && (
                                        <button
                                          type="button"
                                          disabled={!canLink || busy}
                                          title={linkTitle}
                                          onClick={() =>
                                            openOverlay({
                                              kind: "confirm-project",
                                              action: "clear-host",
                                              projectId: project.projectId,
                                              back: false,
                                            })
                                          }
                                        >
                                          撤下主办
                                        </button>
                                      )}
                                      {project.role === "participant" && (
                                        <button
                                          type="button"
                                          disabled={!canLink || busy}
                                          title={linkTitle}
                                          onClick={() =>
                                            openOverlay({
                                              kind: "confirm-project",
                                              action: "remove-participant",
                                              projectId: project.projectId,
                                              back: false,
                                            })
                                          }
                                        >
                                          撤下参与
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!detail.projects.length && (
                              <tr>
                                <td colSpan={4} className="admin-empty">
                                  这个组织还没有关联项目
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {overlay?.kind === "create" && (
        <AdminDialog title="新增组织" onClose={() => setOverlay(null)} busy={busy}>
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const name = overlay.name.trim();
                if (!name || !canUpdate) return;
                void commit(
                  () => api("/admin/orgs", { name, parentId: overlay.parentId || null }, "POST"),
                  "组织已新增",
                );
              }}
            >
              <div className="dialog-form-scroll admin-editor-fields">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <div className="admin-form-grid">
                  <TextField
                    label="组织名称"
                    autoFocus
                    required
                    maxLength={80}
                    value={overlay.name}
                    disabled={busy}
                    onChange={(event) => setOverlay({ ...overlay, name: event.target.value })}
                  />
                  <SelectField
                    allOption={false}
                    label="上级组织"
                    value={overlay.parentId}
                    disabled={busy}
                    onChange={(parent) => setOverlay({ ...overlay, parentId: parent })}
                    options={parentOptions()}
                  />
                </div>
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy || !canUpdate || !overlay.name.trim()}>
                  新增组织
                </button>
              </DialogFooter>
            </form>
          )}
        </AdminDialog>
      )}
      {overlay?.kind === "rename" && selectedId && (
        <AdminDialog title="改名" onClose={() => setOverlay(null)} busy={busy}>
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(event) => {
                event.preventDefault();
                const name = overlay.name.trim();
                if (!name || !canUpdate) return;
                void commit(
                  () => api(`/admin/orgs/${encodeURIComponent(selectedId)}`, { name }, "PATCH"),
                  "组织已改名",
                );
              }}
            >
              <div className="dialog-form-scroll admin-editor-fields">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <TextField
                  label="组织名称"
                  autoFocus
                  required
                  maxLength={80}
                  value={overlay.name}
                  disabled={busy}
                  onChange={(event) => setOverlay({ ...overlay, name: event.target.value })}
                />
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy || !canUpdate || !overlay.name.trim()}>
                  保存
                </button>
              </DialogFooter>
            </form>
          )}
        </AdminDialog>
      )}
      {overlay?.kind === "move" && selectedId && (
        <AdminDialog title="移动组织" onClose={() => setOverlay(null)} busy={busy}>
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canUpdate) return;
                void commit(
                  () =>
                    api(
                      `/admin/orgs/${encodeURIComponent(selectedId)}`,
                      { parentId: overlay.parentId || null },
                      "PATCH",
                    ),
                  "组织已移动",
                );
              }}
            >
              <div className="dialog-form-scroll admin-editor-fields">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p>将「{orgName}」移动到所选上级下面。不能移动到自身或下级组织。</p>
                <SelectField
                  allOption={false}
                  label="上级组织"
                  value={overlay.parentId}
                  disabled={busy}
                  onChange={(parent) => setOverlay({ ...overlay, parentId: parent })}
                  options={parentOptions(blockedParentIds(orgs, selectedId))}
                />
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button
                  className="primary"
                  disabled={busy || !canUpdate || (overlay.parentId || null) === (parentId || null)}
                >
                  保存
                </button>
              </DialogFooter>
            </form>
          )}
        </AdminDialog>
      )}
      {(overlay?.kind === "primary" || overlay?.kind === "secondary") && (
        <AdminDialog
          title={overlay.kind === "primary" ? "设主组织" : "设兼岗"}
          onClose={() => setOverlay(null)}
          busy={busy}
        >
          {(close) => {
            const people = overlay.kind === "primary" ? visiblePrimary : visibleSecondary;
            return (
              <>
                <div className="dialog-form-scroll">
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <p>
                    {overlay.kind === "primary"
                      ? "选择账号后单独确认。已停用的账号不会出现在主组织候选里，确认前也不会改掉原来的主组织。"
                      : "选择账号后单独确认。设为兼岗不会顺带改掉该账号的主组织。"}
                  </p>
                  <TextField
                    dense
                    label="搜索"
                    placeholder="搜索姓名或用户名"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>账号</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((user) => (
                          <tr key={user.id}>
                            <td>
                              <strong>{user.name}</strong>
                              <small>
                                {user.username}
                                {user.disabledAt ? " · 已停用" : ""}
                                {overlay.kind === "secondary" &&
                                memberOf(user.id)?.kind === "primary"
                                  ? " · 当前是主组织"
                                  : ""}
                              </small>
                            </td>
                            <td>
                              <button
                                type="button"
                                disabled={!canAssign || busy}
                                onClick={() =>
                                  setOverlay({
                                    kind: "confirm-member",
                                    mode: overlay.kind,
                                    userId: user.id,
                                    back: overlay.kind,
                                  })
                                }
                              >
                                {overlay.kind === "primary" ? "设主组织" : "设兼岗"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!people.length && (
                          <tr>
                            <td colSpan={2} className="admin-empty">
                              {overlay.kind === "primary"
                                ? "没有可设为主组织的账号"
                                : "没有可设为兼岗的账号"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" disabled={busy} onClick={close}>
                    关闭
                  </button>
                </DialogFooter>
              </>
            );
          }}
        </AdminDialog>
      )}
      {overlay?.kind === "project" && (
        <AdminDialog title={linkLabel[overlay.action]} onClose={() => setOverlay(null)} busy={busy}>
          {(close) => {
            const action = overlay.action;
            const projects = projectRows(action).filter((project) =>
              matchesText(query, [project.name, scopeLabel(project.scope), project.extra]),
            );
            return (
              <>
                <div className="dialog-form-scroll">
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <p>选择项目后单独确认。范围只显示文字，不能在这里修改。</p>
                  <TextField
                    dense
                    label="搜索"
                    placeholder="搜索项目"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>范围</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map((project) => (
                          <tr key={project.id}>
                            <td>
                              <strong>{project.name}</strong>
                              {(project.archivedAt || project.extra) && (
                                <small>
                                  {[project.archivedAt ? "已归档" : "", project.extra]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              )}
                            </td>
                            <td>{scopeLabel(project.scope)}</td>
                            <td>
                              <button
                                type="button"
                                disabled={!canLink || busy}
                                onClick={() =>
                                  setOverlay({
                                    kind: "confirm-project",
                                    action,
                                    projectId: project.id,
                                    back: true,
                                  })
                                }
                              >
                                {linkLabel[action]}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!projects.length && (
                          <tr>
                            <td colSpan={3} className="admin-empty">
                              没有可{linkLabel[action]}的项目
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <DialogFooter>
                  <button type="button" disabled={busy} onClick={close}>
                    关闭
                  </button>
                </DialogFooter>
              </>
            );
          }}
        </AdminDialog>
      )}
      {overlay?.kind === "confirm-member" && (
        <AdminDialog
          title={
            overlay.mode === "primary"
              ? "设主组织"
              : overlay.mode === "secondary"
                ? "设兼岗"
                : "移出"
          }
          onClose={() => setOverlay(null)}
          busy={busy}
        >
          {(close) => (
            <>
              <div className="dialog-form-scroll">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p>
                  {overlay.mode === "primary"
                    ? primaryMessage(overlay.userId)
                    : overlay.mode === "secondary"
                      ? secondaryMessage(overlay.userId)
                      : `将「${personName(overlay.userId)}」移出「${orgName}」？`}
                </p>
              </div>
              <DialogFooter>
                {overlay.back && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setOverlay({ kind: overlay.back! });
                    }}
                  >
                    返回
                  </button>
                )}
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    busy ||
                    !canAssign ||
                    (overlay.mode === "primary" &&
                      !!userOf(overlay.userId)?.primaryOrgId &&
                      userOf(overlay.userId)?.primaryOrgId !== selectedId)
                  }
                  onClick={() => void saveMember(overlay.mode, overlay.userId)}
                >
                  确认
                </button>
              </DialogFooter>
            </>
          )}
        </AdminDialog>
      )}
      {overlay?.kind === "confirm-project" && overlay.projectId && (
        <AdminDialog title={linkLabel[overlay.action]} onClose={() => setOverlay(null)} busy={busy}>
          {(close) => (
            <>
              <div className="dialog-form-scroll">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p>{projectMessage(overlay.action, overlay.projectId)}</p>
              </div>
              <DialogFooter>
                {overlay.back && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setOverlay({ kind: "project", action: overlay.action });
                    }}
                  >
                    返回
                  </button>
                )}
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !canLink}
                  onClick={() => void saveProject(overlay.action, overlay.projectId)}
                >
                  确认
                </button>
              </DialogFooter>
            </>
          )}
        </AdminDialog>
      )}
      {overlay?.kind === "confirm-archive" && selectedId && (
        <AdminDialog title="归档组织" onClose={() => setOverlay(null)} busy={busy}>
          {(close) => (
            <>
              <div className="dialog-form-scroll">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p>归档组织「{orgName}」？归档后仍会留在组织树中，并标成已归档。</p>
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !canUpdate || !!archivedAt}
                  onClick={() =>
                    void commit(
                      () =>
                        api(`/admin/orgs/${encodeURIComponent(selectedId)}/archive`, {}, "POST"),
                      "组织已归档",
                    )
                  }
                >
                  确认
                </button>
              </DialogFooter>
            </>
          )}
        </AdminDialog>
      )}
    </section>
  );
}
