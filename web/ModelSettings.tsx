import { useEffect, useState } from "react";
import { MODEL_REASONING_EFFORTS, MODEL_REASONING_LABELS } from "../shared/model-settings.js";
import { showTip } from "./Tip";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import type { WorkspaceApi } from "./workspace-api";

type RouteView = {
  baseUrl?: string;
  model?: string;
  reasoningEffort?: string;
  apiKeyConfigured?: boolean;
  inherited?: boolean;
  sourceDetail?: string;
  legacyFallback?: boolean;
  error?: string;
};

type SettingsView = {
  configured: boolean;
  unreadable: boolean;
  version: number;
  updatedAt?: string | null;
  error: string | null;
  usingEnvironment: boolean;
  default: RouteView | null;
  knowledge: RouteView | null;
  executor?: RouteView | null;
  sourcesDiffer: boolean;
  knowledgeKeyRetained: boolean;
  searchKeyConfigured?: boolean;
};

type Draft = {
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  apiKey: string;
  knowledgeOverride: boolean;
  knowledgeBaseUrl: string;
  knowledgeModel: string;
  knowledgeReasoningEffort: string;
  knowledgeApiKey: string;
  searchApiKey: string;
};

const emptyDraft = (): Draft => ({
  baseUrl: "",
  model: "",
  reasoningEffort: "low",
  apiKey: "",
  knowledgeOverride: false,
  knowledgeBaseUrl: "",
  knowledgeModel: "",
  knowledgeReasoningEffort: "medium",
  knowledgeApiKey: "",
  searchApiKey: "",
});

function draftFrom(view: SettingsView): Draft {
  const knowledge = view.knowledge;
  const override = !!knowledge && !knowledge.inherited;
  return {
    baseUrl: view.default?.baseUrl || "",
    model: view.default?.model || "",
    reasoningEffort: view.default?.reasoningEffort || "low",
    apiKey: "",
    knowledgeOverride: override,
    knowledgeBaseUrl: override ? knowledge?.baseUrl || "" : "",
    knowledgeModel: override ? knowledge?.model || "" : "",
    knowledgeReasoningEffort: override ? knowledge?.reasoningEffort || "medium" : "medium",
    knowledgeApiKey: "",
    searchApiKey: "",
  };
}

function EffortSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      allOption={false}
      label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={MODEL_REASONING_EFFORTS.map((effort) => ({
        value: effort,
        label: `${MODEL_REASONING_LABELS[effort]} (${effort})`,
      }))}
    />
  );
}

export function ModelSettings({ api, permissions }: { api: WorkspaceApi; permissions: string[] }) {
  const canSave = permissions.includes("model-settings.update");
  const [view, setView] = useState<SettingsView | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setError("");
    try {
      const next = (await api("/admin/model-settings")) as SettingsView;
      setView(next);
      setDraft(draftFrom(next));
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  useEffect(() => {
    let cancelled = false;
    void api("/admin/model-settings")
      .then((next: SettingsView) => {
        if (cancelled) return;
        setView(next);
        setDraft(draftFrom(next));
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  const patch = (partial: Partial<Draft>) => setDraft((current) => ({ ...current, ...partial }));
  const save = async () => {
    if (!view || !canSave) return;
    setBusy(true);
    setError("");
    try {
      const next = (await api(
        "/admin/model-settings",
        {
          expectedVersion: view.version || 0,
          ...draft,
        },
        "PUT",
      )) as SettingsView;
      setView(next);
      setDraft(draftFrom(next));
      showTip("模型配置已生效。运行中的任务保留原模型；同迭代的新请求会等待子任务结束后切换。");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!view) return <p>{error || "正在读取模型配置…"}</p>;
  const locked = !canSave || busy;
  return (
    <section className="admin-editor model-settings">
      <div className="model-settings-heading">
        <div>
          <h2>模型配置</h2>
          <p>
            {view.usingEnvironment
              ? "当前来源：环境变量"
              : `当前来源：数据库 · 版本 ${view.version}`}
            {view.updatedAt &&
              ` · 更新于 ${new Date(/Z$|[+]\d\d:\d\d$/.test(view.updatedAt) ? view.updatedAt : `${view.updatedAt.replace(" ", "T")}Z`).toLocaleString()}`}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => void load()}>
          重新读取
        </button>
      </div>
      <div className="model-settings-current" aria-label="当前生效的模型">
        {(
          [
            ["小祥与子 Agent", view.default],
            ["老翁", view.knowledge],
            ...(view.executor ? [["子任务（环境变量）", view.executor]] : []),
          ] as [string, RouteView | null][]
        ).map(([name, route]) => (
          <div key={name}>
            <strong>
              {name}
              {route?.inherited ? " · 继承默认模型" : ""}
            </strong>
            <span>{route?.error || route?.model || "配置不可用"}</span>
            <small>{route?.baseUrl}</small>
            {route?.reasoningEffort && <small>推理强度：{route.reasoningEffort}</small>}
            {view.usingEnvironment && route?.sourceDetail && (
              <small>
                {route.legacyFallback ? "旧变量回退：" : "配置变量："}
                {route.sourceDetail} / {route.sourceDetail}_BASE_URL / {route.sourceDetail}_API_KEY
              </small>
            )}
          </div>
        ))}
      </div>
      <p>
        {view.usingEnvironment
          ? "数据库还没有模型配置，当前请求使用环境变量。保存并通过校验后改为数据库配置。"
          : `当前使用数据库配置，版本 ${view.version}。`}
        默认模型同时用于老翁、小祥和子
        Agent。老翁可以独立覆盖。运行中的任务保留启动时的模型；同迭代尚有子任务运行时，新请求等待它们结束后切换。密钥加密保存，页面不回显。
      </p>
      {view.sourcesDiffer && view.usingEnvironment && (
        <p>
          环境变量存在分开的覆盖或旧变量回退，请核对上方配置。保存后小祥与子 Agent 统一为默认模型。
        </p>
      )}
      {view.unreadable && (
        <p role="alert" className="error">
          {view.error}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>默认模型</h3>
      <div className="admin-form-grid">
        <TextField
          label="默认地址"
          value={draft.baseUrl}
          disabled={locked}
          onChange={(event) => patch({ baseUrl: event.target.value })}
        />
        <TextField
          label="默认模型"
          value={draft.model}
          disabled={locked}
          onChange={(event) => patch({ model: event.target.value })}
        />
        <EffortSelect
          label="默认推理强度"
          value={draft.reasoningEffort}
          disabled={locked}
          onChange={(reasoningEffort) => patch({ reasoningEffort })}
        />
        <TextField
          label="默认 API 密钥"
          type="password"
          autoComplete="new-password"
          value={draft.apiKey}
          disabled={locked}
          placeholder={
            view.configured && view.default?.apiKeyConfigured
              ? "已配置，留空则继续使用"
              : "首次保存需填写密钥"
          }
          onChange={(event) => patch({ apiKey: event.target.value })}
        />
        <TextField
          label="网页搜索密钥"
          type="password"
          autoComplete="new-password"
          value={draft.searchApiKey}
          disabled={locked}
          placeholder={
            view.searchKeyConfigured ? "已配置，留空则继续使用" : "供完整调度和全网检索使用"
          }
          onChange={(event) => patch({ searchApiKey: event.target.value })}
        />
      </div>
      <div>
        <label className="model-settings-override">
          <input
            type="checkbox"
            checked={draft.knowledgeOverride}
            disabled={locked}
            onChange={(event) => patch({ knowledgeOverride: event.target.checked })}
          />{" "}
          老翁使用独立模型
        </label>
      </div>
      {draft.knowledgeOverride && (
        <div className="admin-form-grid">
          <TextField
            label="老翁地址"
            value={draft.knowledgeBaseUrl}
            disabled={locked}
            onChange={(event) => patch({ knowledgeBaseUrl: event.target.value })}
          />
          <TextField
            label="老翁模型"
            value={draft.knowledgeModel}
            disabled={locked}
            onChange={(event) => patch({ knowledgeModel: event.target.value })}
          />
          <EffortSelect
            label="老翁推理强度"
            value={draft.knowledgeReasoningEffort}
            disabled={locked}
            onChange={(knowledgeReasoningEffort) => patch({ knowledgeReasoningEffort })}
          />
          <TextField
            label="老翁 API 密钥"
            type="password"
            autoComplete="new-password"
            value={draft.knowledgeApiKey}
            disabled={locked}
            placeholder={
              view.configured &&
              ((!view.knowledge?.inherited && view.knowledge?.apiKeyConfigured) ||
                view.knowledgeKeyRetained)
                ? "已配置，留空则继续使用"
                : "必填"
            }
            onChange={(event) => patch({ knowledgeApiKey: event.target.value })}
          />
        </div>
      )}
      {canSave && (
        <div className="admin-editor-actions">
          <span className="model-settings-validation">
            保存前校验普通响应、流式响应和老翁结构化输出。校验失败保留当前配置。
          </span>
          <button className="primary" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? "正在校验…" : "校验并保存"}
          </button>
        </div>
      )}
    </section>
  );
}
