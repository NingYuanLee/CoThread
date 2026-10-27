import { useEffect, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";
import { TextField } from "./TextField";

type EnvironmentVariable = {
  key: string;
  name: string;
  configured: boolean;
  updatedAt: string | null;
};

export function EnvironmentVariables({
  api,
  basePath,
  empty,
}: {
  api: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  basePath: string;
  empty: string;
}) {
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [remarkKey, setRemarkKey] = useState("");
  const [remarkText, setRemarkText] = useState("");
  const [remarkError, setRemarkError] = useState("");
  const [remarkLoading, setRemarkLoading] = useState(false);

  const load = () =>
    api(basePath).then((value) => {
      const list = (value as { variables?: EnvironmentVariable[] }).variables || [];
      setVariables(list);
    });

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [basePath]);

  const save = async (key: string) => {
    setBusyKey(key);
    setError("");
    try {
      await api(`${basePath}/${encodeURIComponent(key)}`, { value: drafts[key] || "" }, "PUT");
      setDrafts((current) => ({ ...current, [key]: "" }));
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyKey("");
    }
  };

  const clear = async (key: string) => {
    setBusyKey(key);
    setError("");
    try {
      await api(`${basePath}/${encodeURIComponent(key)}`, {}, "DELETE");
      setDrafts((current) => ({ ...current, [key]: "" }));
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyKey("");
    }
  };

  const openRemark = async (key: string) => {
    setRemarkKey(key);
    setRemarkText("");
    setRemarkError("");
    setRemarkLoading(true);
    try {
      const result = (await api(`${basePath}/${encodeURIComponent(key)}/remark`)) as {
        markdown?: string;
      };
      setRemarkText(result.markdown || "");
    } catch (reason) {
      setRemarkError((reason as Error).message);
    } finally {
      setRemarkLoading(false);
    }
  };

  if (!variables.length) return <p className="muted">{empty}</p>;

  return (
    <div className="env-var-panel">
      {error && <p className="error">{error}</p>}
      <table className="env-var-table">
        <thead>
          <tr>
            <th>key</th>
            <th>value</th>
            <th>remark</th>
          </tr>
        </thead>
        <tbody>
          {variables.map((variable) => {
            const draft = drafts[variable.key] || "";
            const busy = busyKey === variable.key;
            return (
              <tr key={variable.key}>
                <th scope="row">
                  <code className="env-var-key">{variable.key}</code>
                  <small>{variable.name}</small>
                </th>
                <td>
                  <div className="env-var-value">
                    <TextField
                      dense
                      type="password"
                      autoComplete="off"
                      aria-label={`${variable.key} 的值`}
                      value={draft}
                      disabled={busy}
                      placeholder={variable.configured ? "已保存，输入新值替换" : "未设置"}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [variable.key]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void save(variable.key);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy || !draft.trim()}
                      onClick={() => void save(variable.key)}
                    >
                      保存
                    </button>
                    {variable.configured && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void clear(variable.key)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void openRemark(variable.key)}
                  >
                    说明
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {remarkKey && (
        <ModalBackdrop onClose={() => setRemarkKey("")}>
          {(close) => (
            <section
              className="library-organize-dialog env-remark-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="env-remark-title"
            >
              <DialogHeader
                title={<>{remarkKey}</>}
                titleId="env-remark-title"
                subtitle={<>环境变量说明</>}
                onClose={close}
                closeLabel="关闭说明"
              />
              <div className="dialog-scroll-region">
                {remarkLoading && <p className="muted">正在加载说明…</p>}
                {remarkError && <p className="error">{remarkError}</p>}
                {!remarkLoading && !remarkError && (
                  <MarkdownDocumentPreview
                    mode="preview"
                    text={remarkText}
                    selected={null}
                    filename={`${remarkKey}.md`}
                    nativeSourceFrame={null}
                  />
                )}
              </div>
            </section>
          )}
        </ModalBackdrop>
      )}
    </div>
  );
}
