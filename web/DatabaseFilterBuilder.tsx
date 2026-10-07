import React, { useMemo, useState } from "react";
import { UiIcon } from "./ui-icon";

type ScalarFilterType = "string" | "number" | "boolean";
type FilterType = ScalarFilterType | "date" | "null" | "json" | "array";
type FilterJoin = "and" | "or";

export type DatabaseFilterCondition = {
  id: string;
  join: FilterJoin;
  field: string;
  type: FilterType;
  arrayItemType?: ScalarFilterType;
  operator: string;
  value: unknown;
};

export type DatabaseFilterGroup = {
  id: string;
  join: FilterJoin;
  conditions: DatabaseFilterCondition[];
};

export type DatabaseFilterSpec = { groups: DatabaseFilterGroup[] };

const TYPE_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: "string", label: "字符串" },
  { value: "number", label: "数字" },
  { value: "boolean", label: "布尔值" },
  { value: "date", label: "日期时间" },
  { value: "null", label: "空值" },
  { value: "json", label: "JSON 对象" },
  { value: "array", label: "数组" },
];

const ARRAY_ITEM_TYPES: Array<{ value: ScalarFilterType; label: string }> = [
  { value: "string", label: "字符串" },
  { value: "number", label: "数字" },
  { value: "boolean", label: "布尔值" },
];

const COMMON = [
  { value: "eq", label: "等于" },
  { value: "neq", label: "不等于" },
];
const EXISTS = [
  { value: "exists", label: "字段存在" },
  { value: "not_exists", label: "字段不存在" },
];
const OPERATORS: Record<FilterType, Array<{ value: string; label: string }>> = {
  string: [
    ...COMMON,
    { value: "regex", label: "正则匹配" },
    { value: "regex_i", label: "正则匹配（不区分大小写）" },
    { value: "contains", label: "包含文本" },
    { value: "starts_with", label: "开头是" },
    { value: "ends_with", label: "结尾是" },
    ...EXISTS,
  ],
  number: [
    ...COMMON,
    { value: "gt", label: "大于" },
    { value: "gte", label: "大于等于" },
    { value: "lt", label: "小于" },
    { value: "lte", label: "小于等于" },
    ...EXISTS,
  ],
  boolean: [...COMMON, ...EXISTS],
  date: [
    ...COMMON,
    { value: "gt", label: "晚于" },
    { value: "gte", label: "不早于" },
    { value: "lt", label: "早于" },
    { value: "lte", label: "不晚于" },
    ...EXISTS,
  ],
  null: [
    { value: "eq", label: "为空" },
    { value: "neq", label: "不为空" },
    ...EXISTS,
  ],
  json: [...COMMON, ...EXISTS],
  array: [
    { value: "any_eq", label: "等于任意一个" },
    { value: "any_neq", label: "不等于任意一个" },
    ...EXISTS,
  ],
};

const id = () => crypto.randomUUID();

function newCondition(join: FilterJoin = "and"): DatabaseFilterCondition {
  return { id: id(), join, field: "", type: "string", operator: "eq", value: "" };
}

function newGroup(join: FilterJoin = "and"): DatabaseFilterGroup {
  return { id: id(), join, conditions: [newCondition()] };
}

function cloneFilter(value: DatabaseFilterSpec | null): DatabaseFilterSpec {
  return value?.groups.length
    ? { groups: value.groups.map((group) => ({ ...group, conditions: group.conditions.map((row) => ({ ...row })) })) }
    : { groups: [newGroup()] };
}

export function databaseFilterCount(value: DatabaseFilterSpec | null) {
  return value?.groups.reduce((total, group) => total + group.conditions.length, 0) || 0;
}

function needsValue(operator: string) {
  return operator !== "exists" && operator !== "not_exists";
}

function normalizeValue(condition: DatabaseFilterCondition) {
  if (!needsValue(condition.operator) || condition.type === "null") return null;
  if (condition.type === "array") {
    const itemType = condition.arrayItemType || "string";
    let values: unknown[];
    if (Array.isArray(condition.value)) {
      values = condition.value;
    } else {
      const raw = String(condition.value ?? "").trim();
      if (!raw) throw new Error(`字段 ${condition.field} 缺少条件值`);
      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) throw new Error();
          values = parsed;
        } catch {
          throw new Error(`字段 ${condition.field} 需要有效的 JSON 数组`);
        }
      } else {
        values = raw.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
      }
    }
    if (!values.length) throw new Error(`字段 ${condition.field} 至少需要一个条件值`);
    if (values.length > 100) throw new Error(`字段 ${condition.field} 最多可填写 100 个条件值`);
    if (itemType === "number") {
      return values.map((item) => {
        const number = Number(item);
        if (!Number.isFinite(number)) throw new Error(`字段 ${condition.field} 的数组项需要是有效数字`);
        return number;
      });
    }
    if (itemType === "boolean") {
      return values.map((item) => {
        if (item === true || item === "true") return true;
        if (item === false || item === "false") return false;
        throw new Error(`字段 ${condition.field} 的数组项需要是 TRUE 或 FALSE`);
      });
    }
    return values.map((item) => String(item));
  }
  const value = String(condition.value ?? "").trim();
  if (!value) throw new Error(`字段 ${condition.field} 缺少条件值`);
  if (condition.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`字段 ${condition.field} 需要有效数字`);
    return number;
  }
  if (condition.type === "boolean") return value === "true";
  if (condition.type === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`字段 ${condition.field} 需要有效日期`);
    return date.toISOString();
  }
  if (condition.type === "json") {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      throw new Error(`字段 ${condition.field} 的值需要是 JSON 对象`);
    }
  }
  return value;
}

function normalizedFilter(draft: DatabaseFilterSpec): DatabaseFilterSpec | null {
  if (!draft.groups.length) return null;
  const conditions = draft.groups.flatMap((group) => group.conditions);
  if (
    conditions.length === 1 &&
    !conditions[0].field.trim() &&
    conditions[0].type === "string" &&
    conditions[0].operator === "eq" &&
    String(conditions[0].value ?? "").trim() === ""
  ) {
    return null;
  }
  return {
    groups: draft.groups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => {
        const field = condition.field.trim();
        if (!field) throw new Error("请填写字段名");
        return { ...condition, field, value: normalizeValue({ ...condition, field }) };
      }),
    })),
  };
}

function valuePlaceholder(condition: DatabaseFilterCondition) {
  if (condition.operator === "regex" || condition.operator === "regex_i") return "请输入正则表达式";
  if (condition.type === "json") return '{"key":"value"}';
  if (condition.type === "array") return "逗号或换行分隔，也可输入 JSON 数组";
  return "请输入条件值";
}

export function DatabaseFilterBuilder({
  value,
  fieldOptions,
  onApply,
  onCancel,
}: {
  value: DatabaseFilterSpec | null;
  fieldOptions: string[];
  onApply: (filter: DatabaseFilterSpec | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => cloneFilter(value));
  const [error, setError] = useState("");
  const fieldListId = useMemo(() => `database-fields-${id()}`, []);

  const updateGroup = (groupId: string, update: (group: DatabaseFilterGroup) => DatabaseFilterGroup) =>
    setDraft((current) => ({
      groups: current.groups.map((group) => (group.id === groupId ? update(group) : group)),
    }));

  const updateCondition = (
    groupId: string,
    conditionId: string,
    patch: Partial<DatabaseFilterCondition>,
  ) =>
    updateGroup(groupId, (group) => ({
      ...group,
      conditions: group.conditions.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    }));

  const apply = () => {
    setError("");
    try {
      onApply(normalizedFilter(draft));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "筛选条件不完整");
    }
  };

  return (
    <div className="database-filter-builder">
      <datalist id={fieldListId}>
        {fieldOptions.map((field) => <option key={field} value={field} />)}
      </datalist>
      <div className="database-filter-groups">
        {draft.groups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            {groupIndex ? (
              <div className="database-filter-group-join">
                <span />
                <select
                  aria-label={`第 ${groupIndex + 1} 个分组的连接方式`}
                  value={group.join}
                  onChange={(event) =>
                    updateGroup(group.id, (current) => ({ ...current, join: event.target.value as FilterJoin }))
                  }
                >
                  <option value="and">且</option>
                  <option value="or">或</option>
                </select>
                <span />
              </div>
            ) : null}
            <section className="database-filter-group" aria-label={`筛选分组 ${groupIndex + 1}`}>
              {group.conditions.map((condition, conditionIndex) => {
                const noValue = !needsValue(condition.operator) || condition.type === "null";
                const booleanValue = condition.type === "boolean";
                const booleanArray = condition.type === "array" && condition.arrayItemType === "boolean";
                const booleanArrayValues = Array.isArray(condition.value)
                  ? condition.value.map(String)
                  : [];
                return (
                  <div className={`database-filter-row${condition.type === "array" ? " is-array" : ""}`} key={condition.id}>
                    {conditionIndex === 0 ? (
                      <span className="database-filter-where">条件</span>
                    ) : (
                      <select
                        aria-label="条件连接方式"
                        value={condition.join}
                        onChange={(event) =>
                          updateCondition(group.id, condition.id, { join: event.target.value as FilterJoin })
                        }
                      >
                        <option value="and">且</option>
                        <option value="or">或</option>
                      </select>
                    )}
                    <input
                      type="text"
                      list={fieldListId}
                      aria-label="字段名"
                      placeholder="请输入字段名"
                      value={condition.field}
                      onChange={(event) => updateCondition(group.id, condition.id, { field: event.target.value })}
                    />
                    <select
                      aria-label="字段类型"
                      value={condition.type}
                      onChange={(event) => {
                        const type = event.target.value as FilterType;
                        updateCondition(group.id, condition.id, {
                          type,
                          operator: OPERATORS[type][0].value,
                          arrayItemType: type === "array" ? "string" : undefined,
                          value: type === "boolean" ? "true" : "",
                        });
                      }}
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {condition.type === "array" ? (
                      <select
                        aria-label="数组元素类型"
                        value={condition.arrayItemType || "string"}
                        onChange={(event) => {
                          const arrayItemType = event.target.value as ScalarFilterType;
                          updateCondition(group.id, condition.id, {
                            arrayItemType,
                            value: arrayItemType === "boolean" ? ["true"] : "",
                          });
                        }}
                      >
                        {ARRAY_ITEM_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : null}
                    <select
                      aria-label="筛选条件"
                      value={condition.operator}
                      onChange={(event) => updateCondition(group.id, condition.id, { operator: event.target.value })}
                    >
                      {OPERATORS[condition.type].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {noValue ? (
                      <span className="database-filter-no-value">无需填写值</span>
                    ) : booleanArray ? (
                      <div className="database-filter-boolean-values" role="group" aria-label="条件值">
                        {["true", "false"].map((item) => {
                          const selected = booleanArrayValues.includes(item);
                          return (
                            <button
                              type="button"
                              key={item}
                              className={selected ? "is-selected" : ""}
                              aria-pressed={selected}
                              onClick={() => updateCondition(group.id, condition.id, {
                                value: selected
                                  ? booleanArrayValues.filter((value) => value !== item)
                                  : [...booleanArrayValues, item],
                              })}
                            >
                              {item.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    ) : booleanValue ? (
                      <select
                        aria-label="条件值"
                        value={String(condition.value ?? "true")}
                        onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })}
                      >
                        <option value="true">TRUE</option>
                        <option value="false">FALSE</option>
                      </select>
                    ) : (
                      <input
                        type={condition.type === "date" ? "datetime-local" : "text"}
                        aria-label="条件值"
                        placeholder={valuePlaceholder(condition)}
                        value={String(condition.value ?? "")}
                        onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })}
                      />
                    )}
                    <button
                      type="button"
                      className="database-filter-remove"
                      aria-label="删除条件"
                      title="删除条件"
                      disabled={group.conditions.length === 1}
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          conditions: current.conditions.filter((item) => item.id !== condition.id),
                        }))
                      }
                    >
                      <UiIcon name="close" size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="database-filter-group-actions">
                <button
                  type="button"
                  onClick={() => updateGroup(group.id, (current) => ({ ...current, conditions: [...current.conditions, newCondition()] }))}
                >
                  <UiIcon name="plus" size={14} />
                  添加条件
                </button>
                {draft.groups.length > 1 ? (
                  <button
                    type="button"
                    className="database-filter-delete-group"
                    onClick={() => setDraft((current) => ({ groups: current.groups.filter((item) => item.id !== group.id) }))}
                  >
                    <UiIcon name="trash" size={13} />
                    删除分组
                  </button>
                ) : null}
              </div>
            </section>
          </React.Fragment>
        ))}
      </div>
      <button
        type="button"
        className="database-filter-add-group"
        onClick={() => setDraft((current) => ({ groups: [...current.groups, newGroup()] }))}
      >
        <UiIcon name="plus" size={14} />
        添加分组
      </button>
      {error ? <p className="miniprogram-config-error">{error}</p> : null}
      <footer className="database-filter-footer">
        <button type="button" onClick={() => { setDraft({ groups: [newGroup()] }); setError(""); }}>
          清空
        </button>
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="primary" onClick={apply}>应用</button>
      </footer>
    </div>
  );
}
