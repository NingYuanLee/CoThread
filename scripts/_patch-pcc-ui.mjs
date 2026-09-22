import fs from "fs";

const path = "web/ProjectCodeConnectors.tsx";
let src = fs.readFileSync(path, "utf8");

// Fix saveScope to GitKind only
src = src.replace(
  /const saveScope = async \(kind: ConnectorKind\) => \{/,
  "const saveScope = async (kind: GitKind) => {",
);

// Fix loadRepos / toggleRepo / closeRepos
src = src.replace(
  /const loadRepos = async \(kind: ConnectorKind\) => \{/,
  "const loadRepos = async (kind: GitKind) => {",
);
src = src.replace(
  /const toggleRepo = \(kind: ConnectorKind, repo: PlatformRepo\) => \{/,
  "const toggleRepo = (kind: GitKind, repo: PlatformRepo) => {",
);
src = src.replace(
  /const closeRepos = \(kind: ConnectorKind\) => \{/,
  "const closeRepos = (kind: GitKind) => {",
);

// Insert design helpers before `if (!config)`
const designHelpers = `
  const addDesignUrl = async () => {
    const url = designUrl.trim();
    if (!url) {
      showTip("请先粘贴 MasterGo 设计稿链接", "error");
      return;
    }
    setBusy(true);
    try {
      const resolved = await api(\`/projects/\${projectId}/code-connectors/mastergo/resolve-url\`, { url }, "POST") as {
        fileId: string; layerId: string; label: string; resourceUrl: string;
      };
      setDesignDrafts((previous) => {
        const key = \`\${resolved.fileId}\\\\0\${resolved.layerId || ""}\`;
        if (previous.some((item) => \`\${item.fileId}\\\\0\${item.layerId || ""}\` === key)) {
          showTip("该设计稿已在范围内", "error");
          return previous;
        }
        if (previous.length >= 20) {
          showTip("最多加入 20 个设计稿", "error");
          return previous;
        }
        return [...previous, {
          id: \`draft-\${resolved.fileId}-\${resolved.layerId || "root"}\`,
          platform: "mastergo" as const,
          fileId: resolved.fileId,
          layerId: resolved.layerId || "",
          label: resolved.label,
          resourceUrl: resolved.resourceUrl,
        }];
      });
      setDesignUrl("");
      showTip("已加入范围草稿，请点保存");
    } catch (error) {
      showTip((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const removeDesignDraft = (fileId: string, layerId: string) => {
    setDesignDrafts((previous) => previous.filter((item) => !(item.fileId === fileId && (item.layerId || "") === (layerId || ""))));
  };

  const saveDesignScope = async () => {
    setBusy(true);
    try {
      const next = await api(\`/projects/\${projectId}/code-connectors/mastergo/scope\`, {
        files: designDrafts.map((item) => ({
          fileId: item.fileId,
          layerId: item.layerId || "",
          label: item.label,
          resourceUrl: item.resourceUrl,
        })),
      }, "PUT") as CodeConfig;
      setConfig(next);
      setDesignDrafts(next.designResources || []);
      showTip("已更新 MasterGo 设计稿范围");
    } catch (error) {
      showTip((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

`;

if (!src.includes("addDesignUrl")) {
  src = src.replace(/\n  if \(!config\) return/, `${designHelpers}\n  if (!config) return`);
}

// Update note + tabs + counts
src = src.replace(
  /连接器是能力（平台令牌），开关控制是否启用；仓库是范围。启用后从平台拉取列表勾选即可，无需手填地址。/,
  "连接器是能力（平台令牌），开关控制是否启用；仓库/设计稿是范围。代码平台可拉取勾选，MasterGo 粘贴链接加入。",
);

src = src.replace(
  /aria-label="代码连接器平台"/,
  'aria-label="项目连接器平台"',
);

src = src.replace(
  /\{\(\["yunxiao", "github"\] as const\)\.map\(\(tab\) => \(/,
  "{TAB_ORDER.map((tab) => (",
);

src = src.replace(
  /const tabCounts = \{\n    yunxiao: config\.remotes\.filter\(\(remote\) => remote\.platform === "yunxiao"\)\.length,\n    github: config\.remotes\.filter\(\(remote\) => remote\.platform === "github"\)\.length,\n  \};/,
  `const tabCounts = {
    yunxiao: config.remotes.filter((remote) => remote.platform === "yunxiao").length,
    github: config.remotes.filter((remote) => remote.platform === "github").length,
    mastergo: (config.designResources || []).length,
  };
  const isGit = kind === "github" || kind === "yunxiao";
  const designCount = designDrafts.length;`,
);

// Fix configuredCount for mastergo
src = src.replace(
  /const configuredCount = config\.remotes\.filter\(\(remote\) => remote\.platform === kind\)\.length;/,
  `const configuredCount = kind === "mastergo"
    ? (config.designResources || []).length
    : config.remotes.filter((remote) => remote.platform === kind).length;`,
);

// Replace the scope section: after yunxiao org block, wrap git scope vs mastergo scope
// Find `{kind === "yunxiao" ? (` block end and following `<div className="pcc-scope">`

const mastergoScope = `
            {kind === "mastergo" ? (
              <div className="pcc-scope">
                <div className="pcc-scope-toolbar">
                  <input
                    type="url"
                    name="cothread-mastergo-design-url"
                    autoComplete="off"
                    aria-label="MasterGo 设计稿链接"
                    placeholder="粘贴 MasterGo 文件链接（含 layer_id 更佳）"
                    value={designUrl}
                    disabled={busy || !item.enabled}
                    onChange={(event) => setDesignUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addDesignUrl();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="pcc-icon-btn"
                    disabled={busy || !item.enabled || !designUrl.trim()}
                    title="解析并加入范围"
                    aria-label="解析并加入范围"
                    onClick={() => void addDesignUrl()}
                  >
                    <UiIcon name="plus" size={14} />
                  </button>
                  <button
                    type="button"
                    className="primary pcc-icon-btn"
                    disabled={busy || !item.enabled}
                    title={\`保存范围（\${designCount}）\`}
                    aria-label={\`保存范围，已选 \${designCount} 个\`}
                    onClick={() => void saveDesignScope()}
                  >
                    <UiIcon name="check" size={14} />
                    {designCount > 0 ? <span className="pcc-icon-count">{designCount}</span> : null}
                  </button>
                </div>
                {!item.enabled ? (
                  <p className="muted">启用连接器后可粘贴 MasterGo 链接加入范围。</p>
                ) : !designDrafts.length ? (
                  <p className="muted">粘贴设计稿链接加入范围；读取 DSL 时链接需带 layer_id。</p>
                ) : (
                  <ul className="pcc-repo-list pcc-repo-selected">
                    {designDrafts.map((file) => (
                      <li key={\`\${file.fileId}-\${file.layerId || ""}\`}>
                        <div className="pcc-repo-item pcc-repo-item-plain">
                          <span className="pcc-repo-copy">
                            <span className="pcc-repo-title">
                              <strong title={file.label}>{file.label}</strong>
                              {file.layerId ? <em className="pcc-repo-badge">图层</em> : <em className="pcc-repo-badge">无图层</em>}
                            </span>
                            <small title={file.resourceUrl || file.fileId}>{file.resourceUrl || file.fileId}</small>
                          </span>
                          <button
                            type="button"
                            className="pcc-text-btn"
                            disabled={busy}
                            onClick={() => removeDesignDraft(file.fileId, file.layerId || "")}
                          >
                            移除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
`;

// Insert mastergo scope before the existing pcc-scope for git, and close with )}
if (!src.includes('kind === "mastergo"')) {
  src = src.replace(
    /(\) : null\}\n\n            <div className="pcc-scope">)/,
    `) : null}\n${mastergoScope}\n            <div className="pcc-scope">`,
  );
  // Close the ternary before the canManage else branch - find `</div>\n          </>\n        ) : (`
  src = src.replace(
    /(              \) : null\}\n            <\/div>\n          <\/>\n        \) : \()/,
    "              ) : null}\n            </div>\n            )}\n          </>\n        ) : (",
  );
}

fs.writeFileSync(path, src);
console.log("patched ui", src.includes('kind === "mastergo"'), src.includes("addDesignUrl"));
