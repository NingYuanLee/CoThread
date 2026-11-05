/**
 * 失败诊断的输入。各字段都来自不同层的错误对象，因此允许缺失；
 * `message` / `name` 用 string 是因为本函数只把它们拼进字符串。
 */
export type AgentFailureInput = {
  message?: string | null;
  name?: string | null;
  code?: string | number | null;
  agentStage?: string | null;
  [field: string]: unknown;
};

// Keep diagnostics useful without publishing raw stderr, prompts or secrets.
export function agentFailureCode(error: AgentFailureInput): string {
  const message = String(error.message || "");
  const missing = message.match(/Cannot find package ['"]([^'"]+)['"]/);
  if (missing && /^@deepseek-ai\/[a-z0-9-]+$/.test(missing[1]))
    return `DSH_MISSING_DEPENDENCY:${missing[1]}`;
  if (/Cannot find (package|module)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(message))
    return "DSH_MISSING_DEPENDENCY";
  if (/node:sqlite|No such built-in module|ERR_UNKNOWN_BUILTIN_MODULE/.test(message))
    return "DSH_NODE_COMPATIBILITY";
  if (/ENOENT/.test(message)) return "DSH_FILE_MISSING";
  if (/EACCES|Permission denied/.test(message)) return "DSH_PERMISSION_DENIED";
  if (typeof error.code === "string" && /^ER_[A-Z_]+$/.test(error.code))
    return `DSH_DATABASE:${error.code}`;
  if (/Method not found|Unknown method/i.test(message)) return "DSH_PROTOCOL_MISSING";
  if (typeof error.code === "number" && Number.isInteger(error.code))
    return `DSH_RPC:${error.code}`;
  if (/timeout|timed out|abort|cancel/i.test(`${error.name} ${message}`)) return "DSH_TIMEOUT";
  const stage = ["start", "restore", "observe", "meter", "compact"].includes(
    error.agentStage as string,
  )
    ? (error.agentStage as string).toUpperCase()
    : "CONTEXT";
  return `DSH_${stage}_FAILED`;
}
