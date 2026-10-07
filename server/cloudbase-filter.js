import { HttpError } from "./service.js";

const TYPES = new Set([
  "string",
  "number",
  "boolean",
  "date",
  "null",
  "json",
  "array",
  "array_string",
  "array_number",
  "array_boolean",
]);
const OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "regex",
  "regex_i",
  "contains",
  "starts_with",
  "ends_with",
  "any_eq",
  "any_neq",
  "exists",
  "not_exists",
]);

function invalid(detail) {
  throw new HttpError(400, `筛选条件不正确：${detail}`);
}

function parseJson(value, label) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    invalid(`${label}不是合法 JSON`);
  }
}

function scalar(type, value) {
  if (type === "string") return String(value ?? "");
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) invalid("数字值无效");
    return number;
  }
  if (type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    invalid("布尔值必须是 true 或 false");
  }
  if (type === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) invalid("日期值无效");
    return date;
  }
  if (type === "null") return null;
  if (type === "json") {
    const parsed = parseJson(value, "JSON 值");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      invalid("JSON 值必须是对象");
    }
    return parsed;
  }
  if (type.startsWith("array_")) {
    return scalar(type.slice("array_".length), value);
  }
  invalid(`未知字段类型 ${type}`);
}

function conditionExpression(command, condition) {
  if (!condition || typeof condition !== "object") invalid("条件必须是对象");
  const field = String(condition.field || "").trim();
  const type = String(condition.type || "");
  const operator = String(condition.operator || "");
  const fieldParts = field.split(".");
  if (
    !field ||
    field.length > 128 ||
    field.includes("\0") ||
    fieldParts.some((part) => !part || part.startsWith("$") || part.includes("$"))
  ) {
    invalid(`字段名 ${field || "为空"} 无效`);
  }
  if (!TYPES.has(type)) invalid(`未知字段类型 ${type}`);
  if (!OPERATORS.has(operator)) invalid(`未知条件 ${operator}`);

  if (operator === "exists" || operator === "not_exists") {
    return { [field]: command.exists(operator === "exists") };
  }
  if (type === "null" && (operator === "eq" || operator === "neq")) {
    return command.and(
      { [field]: command.exists(true) },
      { [field]: command[operator](null) },
    );
  }
  if (operator === "regex" || operator === "regex_i") {
    if (type !== "string") invalid("正则匹配只适用于字符串");
    const pattern = String(condition.value ?? "");
    if (!pattern || pattern.length > 256) invalid("正则表达式长度必须为 1 到 256 个字符");
    try {
      return { [field]: new RegExp(pattern, operator === "regex_i" ? "i" : "") };
    } catch {
      invalid("正则表达式格式无效");
    }
  }
  if (["contains", "starts_with", "ends_with"].includes(operator)) {
    if (type !== "string") invalid("包含、开头和结尾条件只适用于字符串");
    const escaped = String(condition.value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern =
      operator === "starts_with" ? `^${escaped}` : operator === "ends_with" ? `${escaped}$` : escaped;
    return { [field]: new RegExp(pattern) };
  }
  if (operator === "any_eq" || operator === "any_neq") {
    if (type !== "array" && !type.startsWith("array_")) invalid("任意元素比较只适用于数组");
    const itemType = type === "array" ? String(condition.arrayItemType || "") : type.slice("array_".length);
    if (!["string", "number", "boolean"].includes(itemType)) invalid(`未知数组元素类型 ${itemType}`);
    const rawValues = Array.isArray(condition.value) ? condition.value : [condition.value];
    if (!rawValues.length) invalid("数组比较至少需要一个值");
    if (rawValues.length > 100) invalid("数组比较最多支持 100 个值");
    const values = rawValues.map((value) => scalar(itemType, value));
    return { [field]: command[operator === "any_eq" ? "in" : "nin"](values) };
  }
  if (["gt", "gte", "lt", "lte"].includes(operator) && !["number", "date"].includes(type)) {
    invalid("大小比较只适用于数字或日期");
  }
  if (["eq", "neq"].includes(operator) && (type === "array" || type.startsWith("array_"))) {
    invalid("数组请使用任意元素比较");
  }
  return { [field]: command[operator](scalar(type, condition.value)) };
}

function joinExpressions(command, items, expressionFor) {
  let expression = expressionFor(items[0]);
  for (let index = 1; index < items.length; index += 1) {
    const item = items[index];
    const join = item.join === "or" ? "or" : "and";
    expression = command[join](expression, expressionFor(item));
  }
  return expression;
}

/** Compile the browser's declarative filter model into CloudBase SDK commands. */
export function compileCloudbaseFilter(command, filter) {
  if (!filter) return null;
  if (!command || typeof command.and !== "function") invalid("数据库命令接口不可用");
  const groups = filter.groups;
  if (!Array.isArray(groups) || !groups.length) return null;
  if (groups.length > 12) invalid("最多添加 12 个分组");

  const normalized = groups.map((group) => {
    const conditions = group?.conditions;
    if (!Array.isArray(conditions) || !conditions.length) invalid("每个分组至少需要一个条件");
    if (conditions.length > 20) invalid("每个分组最多添加 20 个条件");
    return { ...group, conditions };
  });
  return joinExpressions(command, normalized, (group) =>
    joinExpressions(command, group.conditions, (condition) =>
      conditionExpression(command, condition),
    ),
  );
}
