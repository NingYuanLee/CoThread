import React, { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";

type ConnectorKind = "github" | "yunxiao";
type GitKind = ConnectorKind;

type ConnectorState = {
  kind: ConnectorKind;
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string | null;
  organizationId: string | null;
  updatedAt: string | null;
};

type GitRemote = {
  id: string;
  platform: "github" | "yunxiao" | null;
  externalId: string | null;
  label: string;
  remoteUrl: string;
};

type CodeConfig = {
  connectors: { github: ConnectorState; yunxiao: ConnectorState };
  remotes: GitRemote[];
};

type PlatformRepo = {
  externalId: string;
  label: string;
  remoteUrl: string;
  description: string | null;
  private: boolean;
  selected: boolean;
};

const LABELS = { github: "GitHub", yunxiao: "云效 Codeup" } as const;
const TAB_ICONS = { github: "github", yunxiao: "yunxiao" } as const;
const TAB_ORDER = ["yunxiao", "github"] as const;

function repoTitle(label: string) {
  const value = String(label || "").trim();
  if (!value) return "未命名仓库";
  const orgId = /^[a-f0-9]{16,}$/i;
  const spaced = value.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  if (spaced.length > 1 && orgId.test(spaced[0])) return spaced.slice(1).join(" / ");
  const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && orgId.test(parts[0])) return parts.slice(1).join("/");
  if (spaced.length > 1) return spaced[spaced.length - 1];
  return parts[parts.length - 1] || value;
}

export function ProjectCodeConnectors({
  projectId,
  canManage,
  api,
}: {
  projectId: string;
  canManage: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
}) {
  const [config, setConfig] = useState<CodeConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({ github: "", yunxiao: "" });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({ github: false, yunxiao: false });
  // Chrome ignores autocomplete=off on password fields; keep readonly until focus so it won't autofill.
  const [tokenLocked, setTokenLocked] = useState<Record<string, boolean>>({ github: true, yunxiao: true });
  const [orgDraft, setOrgDraft] = useState("");
  const [activeKind, setActiveKind] = useState<ConnectorKind>("yunxiao");
  const [repoState, setRepoState] = useState<Record<string, {
    loading: boolean;
    search: string;
    items: PlatformRepo[];
    selected: Record<string, PlatformRepo>;
    loaded: boolean;
    error: string | null;
  }>>({});

  const reload = async () => {
    const next = await api(`/projects/${projectId}/code-connectors`) as CodeConfig;
    setConfig(next);
    setOrgDraft(next.connectors.yunxiao.organizationId || "");
    setRevealed({ github: false, yunxiao: false });
    setTokenLocked({ github: true, yunxiao: true });
    const nextDrafts: Record<string, string> = { github: "", yunxiao: "" };
    if (canManage) {
      await Promise.all((["github", "yunxiao"] as const).map(async (kind) => {
        if (!next.connectors[kind].hasToken) return;
        try {
          const revealedToken = await api(`/projects/${projectId}/code-connectors/${kind}/token`) as { token: string };
          nextDrafts[kind] = revealedToken.token || "";
        } catch {
          nextDrafts[kind] = "";
        }
      }));
    }
    setDrafts(nextDrafts);
    setRepoState((previous) => {
      const nextState = { ...previous };
      for (const kind of ["github", "yunxiao"] as const) {
        const selected: Record<string, PlatformRepo> = {};
        for (const remote of next.remotes.filter((item) => item.platform === kind)) {
          if (!remote.externalId) continue;
          selected[remote.externalId] = {
            externalId: remote.externalId,
            label: remote.label,
            remoteUrl: remote.remoteUrl,
            description: null,
            private: false,
            selected: true,
          };
        }
        nextState[kind] = {
          loading: false,
          search: previous[kind]?.search || "",
          items: previous[kind]?.items || [],
          selected,
          loaded: previous[kind]?.loaded || false,
          error: null,
        };
      }
      return nextState;
    });
  };

  useEffect(() => {
    void reload().catch((error) => showTip((error as Error).message, "error"));
  }, [projectId, canManage]);

  const saveConnector = async (
    kind: ConnectorKind,
    enabled: boolean,
    token?: string,
    organizationId?: string | null,
    tip?: string,
  ) => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { enabled };
      if (token) body.token = token;
      if (kind === "yunxiao" && organizationId !== undefined) {
        body.organizationId = organizationId;
      } else if (kind === "yunxiao") {
        body.organizationId = orgDraft.trim() || null;
      }
      const next = await api(`/projects/${projectId}/code-connectors/${kind}`, body, "PUT") as CodeConfig;
      setConfig(next);
      if (token) {
        setDrafts((value) => ({ ...value, [kind]: token }));
        setTokenLocked((value) => ({ ...value, [kind]: true }));
        setRevealed((value) => ({ ...value, [kind]: false }));
      }
      if (kind === "yunxiao") setOrgDraft(next.connectors.yunxiao.organizationId || "");
      showTip(tip || (enabled ? `已启用 ${LABELS[kind]} 连接器` : `已停用 ${LABELS[kind]} 连接器`));
    } catch (error) {
      showTip((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveToken = async (kind: ConnectorKind) => {
    const token = drafts[kind];
    if (!token && !config?.connectors[kind].hasToken) {
      showTip("请先填写访问令牌", "error");
      return;
    }
    setBusy(true);
    try {
      const enabled = config?.connectors[kind].enabled || !!token;
      const body: Record<string, unknown> = { enabled };
      if (token) body.token = token;
      if (kind === "yunxiao") body.organizationId = orgDraft.trim() || null;
      const next = await api(`/projects/${projectId}/code-connectors/${kind}`, body, "PUT") as CodeConfig;
      setConfig(next);
      if (token) setDrafts((value) => ({ ...value, [kind]: token }));
      setTokenLocked((value) => ({ ...value, [kind]: true }));
      setRevealed((value) => ({ ...value, [kind]: false }));
      showTip(`已保存 ${LABELS[kind]} 令牌`);
    } catch (error) {
      showTip((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleTokenReveal = (kind: ConnectorKind) => {
    if (!drafts[kind]) return;
    setTokenLocked((value) => ({ ...value, [kind]: false }));
    setRevealed((value) => ({ ...value, [kind]: !value[kind] }));
  };

  const toggleEnabled = async (kind: ConnectorKind, enabled: boolean) => {
    const item = config?.connectors[kind];
    if (!item) return;
    if (enabled && !item.hasToken && !drafts[kind]) {
      showTip("请先填写并保存访问令牌", "error");
      return;
    }
    await saveConnector(kind, enabled, drafts[kind] || undefined);
  };

  const loadRepos = async (kind: GitKind) => {
    setRepoState((previous) => ({
      ...previous,
      [kind]: {
        ...(previous[kind] || { selected: {}, items: [], search: "", loaded: false, error: null }),
        loading: true,
        error: null,
      },
    }));
    try {
      // Always fetch the full platform list; search filters locally after load.
      const result = await api(`/projects/${projectId}/code-connectors/${kind}/repositories`) as {
        repositories: PlatformRepo[];
      };
      setRepoState((previous) => {
        const current = previous[kind] || { selected: {}, items: [], search: "", loaded: false, error: null, loading: false };
        const selected = { ...current.selected };
        for (const item of result.repositories) {
          if (item.selected) selected[item.externalId] = item;
        }
        return {
          ...previous,
          [kind]: {
            ...current,
            loading: false,
            loaded: true,
            items: result.repositories,
            selected,
            error: null,
          },
        };
      });
    } catch (error) {
      setRepoState((previous) => ({
        ...previous,
        [kind]: {
          ...(previous[kind] || { selected: {}, items: [], search: "", loaded: false, loading: false }),
          loading: false,
          error: (error as Error).message,
        },
      }));
      showTip((error as Error).message, "error");
    }
  };

  const toggleRepo = (kind: GitKind, repo: PlatformRepo) => {
    setRepoState((previous) => {
      const current = previous[kind];
      if (!current) return previous;
      const selected = { ...current.selected };
      if (selected[repo.externalId]) delete selected[repo.externalId];
      else selected[repo.externalId] = repo;
      return { ...previous, [kind]: { ...current, selected } };
    });
  };

  const closeRepos = (kind: GitKind) => {
    setRepoState((previous) => {
      const current = previous[kind];
      if (!current) return previous;
      return {
        ...previous,
        [kind]: {
          ...current,
          loaded: false,
          loading: false,
          items: [],
          error: null,
        },
      };
    });
  };

  const saveScope = async (kind: GitKind) => {
    const current = repoState[kind];
    if (!current) return;
    const repositories = Object.values(current.selected);
    if (repositories.length > 20) {
      showTip("每个平台最多勾选 20 个仓库", "error");
      return;
    }
    setBusy(true);
    try {
      const next = await api(`/projects/${projectId}/code-connectors/${kind}/scope`, {
        repositories: repositories.map((item) => ({
          externalId: item.externalId,
          label: item.label,
          remoteUrl: item.remoteUrl,
        })),
      }, "PUT") as CodeConfig;
      setConfig(next);
      const selected: Record<string, PlatformRepo> = {};
      for (const remote of next.remotes.filter((item) => item.platform === kind)) {
        if (!remote.externalId) continue;
        selected[remote.externalId] = {
          externalId: remote.externalId,
          label: remote.label,
          remoteUrl: remote.remoteUrl,
          description: null,
          private: false,
          selected: true,
        };
      }
      setRepoState((previous) => ({
        ...previous,
        [kind]: {
          ...(previous[kind] || { search: "", items: [], loading: false, error: null }),
          selected,
          loaded: false,
          loading: false,
          items: [],
          error: null,
        },
      }));
      showTip(`已更新 ${LABELS[kind]} 仓库范围`);
    } catch (error) {
      showTip((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };


  if (!config) return <p className="muted">正在加载连接器配置…</p>;

  const kind = activeKind;
  const item = config.connectors[kind];
  const scope = repoState[kind];
  const selectedCount = Object.keys(scope?.selected || {}).length;
  const configuredCount = config.remotes.filter((remote) => remote.platform === kind).length;
  const filter = (scope?.search || "").trim().toLowerCase();
  const visibleRepos = !scope?.loaded
    ? []
    : !filter
      ? scope.items
      : scope.items.filter((repo) => (
        repo.label.toLowerCase().includes(filter)
        || repo.remoteUrl.toLowerCase().includes(filter)
        || String(repo.description || "").toLowerCase().includes(filter)
      ));
  const tabCounts = {
    yunxiao: config.remotes.filter((remote) => remote.platform === "yunxiao").length,
    github: config.remotes.filter((remote) => remote.platform === "github").length,
  };

  return (
    <div className="project-code-connectors">
      <p className="muted project-member-note">
        连接器是能力（平台令牌），开关控制是否启用；勾选的仓库是本项目范围。可拉取平台仓库后勾选保存。
      </p>

      <div className="pcc-tabs" role="tablist" aria-label="项目连接器平台">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={activeKind === tab ? "active" : undefined}
            aria-selected={activeKind === tab}
            onClick={() => setActiveKind(tab)}
          >
            <span className="pcc-tab-label">
              <UiIcon name={TAB_ICONS[tab]} size={14} />
              <span>{LABELS[tab]}</span>
            </span>
            {tabCounts[tab] > 0 ? <em className="pcc-tab-count">{tabCounts[tab]}</em> : null}
          </button>
        ))}
      </div>

      <section className="pcc-tab-panel" role="tabpanel" aria-label={LABELS[kind]}>
        <div className="panel-heading">
          <span className="pcc-panel-title">
            <UiIcon name={TAB_ICONS[kind]} size={15} />
            <span>{LABELS[kind]}</span>
          </span>
          <span className="pcc-heading-meta">
            <small>
              {item.hasToken ? item.tokenHint || "已保存令牌" : "未配置令牌"}
              {configuredCount > 0 ? ` · 范围 ${configuredCount} 个` : ""}
            </small>
            {canManage ? (
              <label className="pcc-switch" title={item.enabled ? "停用连接器" : "启用连接器"}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={item.enabled}
                  disabled={busy || (!item.enabled && !item.hasToken && !drafts[kind])}
                  aria-label={`${LABELS[kind]} 连接器开关`}
                  onChange={(event) => void toggleEnabled(kind, event.target.checked)}
                />
              </label>
            ) : (
              <small>{item.enabled ? "已启用" : "未启用"}</small>
            )}
          </span>
        </div>

        {canManage ? (
          <>
            <div className="pcc-inline-row">
              <div className="pcc-secret-field">
                <input
                  type={revealed[kind] ? "text" : "password"}
                  name={`cothread-connector-token-${kind}`}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  aria-label={`${LABELS[kind]} 访问令牌`}
                  placeholder={item.hasToken ? "已保存令牌（可点眼睛查看）" : "粘贴平台访问令牌"}
                  value={drafts[kind]}
                  disabled={busy}
                  readOnly={tokenLocked[kind] !== false}
                  onFocus={() => setTokenLocked((value) => ({ ...value, [kind]: false }))}
                  onBlur={() => {
                    if (!drafts[kind] && !revealed[kind]) {
                      setTokenLocked((value) => ({ ...value, [kind]: true }));
                    }
                  }}
                  onChange={(event) => setDrafts((value) => ({ ...value, [kind]: event.target.value }))}
                />
                <button
                  type="button"
                  className="pcc-secret-toggle"
                  disabled={busy || !drafts[kind]}
                  title={!drafts[kind] ? "暂无令牌可显示" : revealed[kind] ? "隐藏令牌" : "显示令牌"}
                  aria-label={!drafts[kind] ? "暂无令牌可显示" : revealed[kind] ? "隐藏令牌" : "显示令牌"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleTokenReveal(kind)}
                >
                  <UiIcon name="eye" size={14} />
                </button>
              </div>
              <button
                type="button"
                className="primary pcc-icon-btn"
                disabled={busy || (!drafts[kind] && !item.hasToken)}
                title="保存令牌"
                aria-label="保存令牌"
                onClick={() => void saveToken(kind)}
              >
                <UiIcon name="save" size={14} />
              </button>
            </div>

            {kind === "yunxiao" ? (
              <div className="pcc-inline-row">
                <input
                  name="cothread-yunxiao-organization-id"
                  autoComplete="off"
                  aria-label="云效组织 ID"
                  placeholder="组织 ID（中心版必填，可从云效地址 /organization/ 后复制）"
                  value={orgDraft}
                  disabled={busy}
                  onChange={(event) => setOrgDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="primary pcc-icon-btn"
                  disabled={busy || !item.hasToken}
                  title="保存组织 ID"
                  aria-label="保存组织 ID"
                  onClick={() => void saveConnector("yunxiao", item.enabled, undefined, orgDraft.trim() || null, "已保存云效组织 ID")}
                >
                  <UiIcon name="save" size={14} />
                </button>
              </div>
            ) : null}

            <div className="pcc-scope">
              <div className="pcc-scope-toolbar">
                <input
                  type="search"
                  name={`cothread-connector-repo-search-${kind}`}
                  autoComplete="off"
                  aria-label={`${LABELS[kind]} 仓库搜索`}
                  placeholder={scope?.loaded ? "筛选已拉取的仓库…" : "先拉取，再在此筛选"}
                  value={scope?.search || ""}
                  disabled={busy || !item.enabled}
                  onChange={(event) => setRepoState((previous) => ({
                    ...previous,
                    [kind]: {
                      ...(previous[kind] || { selected: {}, items: [], loaded: false, loading: false, error: null }),
                      search: event.target.value,
                    },
                  }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!scope?.loaded) void loadRepos(kind as GitKind);
                    }
                  }}
                />
                <button
                  type="button"
                  className="pcc-icon-btn"
                  disabled={busy || !item.enabled || !!scope?.loading}
                  title={scope?.loading ? "正在拉取…" : "拉取仓库列表"}
                  aria-label={scope?.loading ? "正在拉取" : "拉取仓库列表"}
                  onClick={() => void loadRepos(kind as GitKind)}
                >
                  <UiIcon name="download" size={14} />
                </button>
                <button
                  type="button"
                  className="primary pcc-icon-btn"
                  disabled={busy || !item.enabled || !scope?.loaded}
                  title={`保存范围（已选 ${selectedCount}）`}
                  aria-label={`保存范围，已选 ${selectedCount} 个`}
                  onClick={() => void saveScope(kind as GitKind)}
                >
                  <UiIcon name="check" size={14} />
                  {selectedCount > 0 ? <span className="pcc-icon-count">{selectedCount}</span> : null}
                </button>
                {scope?.loaded || scope?.error ? (
                  <button
                    type="button"
                    className="pcc-icon-btn"
                    disabled={busy}
                    title="收起仓库列表"
                    aria-label="收起仓库列表"
                    onClick={() => closeRepos(kind as GitKind)}
                  >
                    <UiIcon name="close" size={14} />
                  </button>
                ) : null}
              </div>

              {!item.enabled ? (
                <p className="muted">启用连接器后可拉取并勾选仓库。</p>
              ) : scope?.error ? (
                <p className="error" role="alert">{scope.error}</p>
              ) : !scope?.loaded ? (
                <p className="muted">先点下载拉取全部仓库，再在搜索框里筛选；保存或关闭可收起。</p>
              ) : !scope.items.length ? (
                <div className="pcc-repo-panel-head">
                  <p className="muted">平台未返回仓库。</p>
                </div>
              ) : !visibleRepos.length ? (
                <div className="pcc-repo-panel-head">
                  <p className="muted">无匹配「{scope.search}」的仓库，可清空搜索或换关键词。</p>
                </div>
              ) : (
                <>
                  <div className="pcc-repo-panel-head">
                    <small>
                      {filter
                        ? `显示 ${visibleRepos.length} / ${scope.items.length} · 已勾选 ${selectedCount}`
                        : `可选仓库 ${scope.items.length} 个 · 已勾选 ${selectedCount}`}
                    </small>
                    <button type="button" className="pcc-text-btn" disabled={busy} onClick={() => closeRepos(kind as GitKind)}>
                      收起
                    </button>
                  </div>
                  <ul className="pcc-repo-list">
                    {visibleRepos.map((repo) => {
                      const checked = !!scope.selected[repo.externalId];
                      const title = repoTitle(repo.label);
                      return (
                        <li key={repo.externalId}>
                          <label className={`pcc-repo-item${checked ? " selected" : ""}`}>
                            <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleRepo(kind as GitKind, repo)} />
                            <span className="pcc-repo-copy">
                              <span className="pcc-repo-title">
                                <strong title={repo.label}>{title}</strong>
                                {repo.private ? <em className="pcc-repo-badge">私有</em> : null}
                              </span>
                              <small title={repo.remoteUrl}>{repo.remoteUrl}</small>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {!scope?.loaded && configuredCount > 0 ? (
                <ul className="pcc-repo-list pcc-repo-selected">
                  {config.remotes.filter((remote) => remote.platform === kind).map((remote) => (
                    <li key={remote.id}>
                      <div className="pcc-repo-item pcc-repo-item-plain">
                        <span className="pcc-repo-copy">
                          <span className="pcc-repo-title">
                            <strong title={remote.label}>{repoTitle(remote.label)}</strong>
                            <em className="pcc-repo-badge">已选</em>
                          </span>
                          <small title={remote.remoteUrl}>{remote.remoteUrl}</small>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <div className="pcc-scope">
            <p className="muted">仅项目管理员可修改。当前{item.enabled ? "已启用" : "未启用"}，范围 {configuredCount} 个。</p>
            {config.remotes.filter((remote) => remote.platform === kind).map((remote) => (
              <div className="pcc-repo-item pcc-repo-item-plain" key={remote.id}>
                <span className="pcc-repo-copy">
                  <span className="pcc-repo-title">
                    <strong title={remote.label}>{repoTitle(remote.label)}</strong>
                  </span>
                  <small title={remote.remoteUrl}>{remote.remoteUrl}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
