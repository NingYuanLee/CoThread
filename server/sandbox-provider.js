import { LocalSandbox } from "./local-sandbox.js";

const providers = new Map([["local", LocalSandbox]]);
const PREFIX = "cothread:";
function providerKey(name) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  if (!key) throw new Error("沙箱 provider 名称不能为空");
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key))
    throw new Error("沙箱 provider 名称必须是最多32位的字母、数字、下划线或连字符");
  return key;
}
function assertFactory(provider, persistent = false) {
  if (!provider || typeof provider.create !== "function")
    throw new Error("沙箱 provider 必须实现 create()");
  if (persistent && typeof provider.connect !== "function")
    throw new Error("可恢复的沙箱 provider 必须实现 connect()");
  return provider;
}
/** 注册用于持久工作区的完整工厂。重复注册同一实现是幂等的，不允许覆盖已有名称。 */
export function registerSandboxProvider(name, provider) {
  const key = providerKey(name);
  assertFactory(provider, true);
  if (providers.has(key) && providers.get(key) !== provider)
    throw new Error(`沙箱 provider “${key}” 已注册，不能覆盖`);
  for (const [registeredName, implementation] of providers)
    if (implementation === provider && registeredName !== key)
      throw new Error(`沙箱 provider 已注册为“${registeredName}”，不能使用其它名称`);
  providers.set(key, provider);
  return provider;
}
export function listSandboxProviders() {
  return [...providers.keys()];
}
export function resolveSandboxProvider(explicit) {
  // 单次 executeRun 的显式适配器只需要 create；持久工作区另行要求完整注册契约。
  if (explicit) return assertFactory(explicit);
  return sandboxProviderByName(process.env.COTHREAD_SANDBOX_PROVIDER || "local");
}
export function sandboxProviderByName(name) {
  const key = providerKey(name),
    provider = providers.get(key);
  if (!provider)
    throw new Error(`未知的沙箱 provider：${key}。可用：${listSandboxProviders().join("、")}`);
  return provider;
}
export function sandboxProviderName(provider) {
  assertFactory(provider, true);
  for (const [name, value] of providers) if (value === provider) return name;
  throw new Error("持久工作区的 provider 必须先注册，以便重启后恢复");
}
/** 旧的无前缀 ID 明确属于 local；自定义 provider 在原字段内保留身份，不猜测来源。 */
export function parseSandboxReference(reference) {
  const value = String(reference || "");
  if (!value) throw new Error("沙箱引用不能为空");
  if (!value.startsWith(PREFIX)) return { providerName: "local", sandboxId: value };
  const separator = value.indexOf(":", PREFIX.length);
  if (separator < 0 || !value.slice(separator + 1)) throw new Error("沙箱引用格式无效");
  return {
    providerName: providerKey(value.slice(PREFIX.length, separator)),
    sandboxId: value.slice(separator + 1),
  };
}
export function formatSandboxReference(provider, sandboxId) {
  const name = sandboxProviderName(provider);
  if (typeof sandboxId !== "string" || !sandboxId || sandboxId.startsWith(PREFIX))
    throw new Error("沙箱标识无效");
  const value = name === "local" ? sandboxId : `${PREFIX}${name}:${sandboxId}`;
  if (value.length > 160) throw new Error("沙箱持久引用超过160字符");
  return value;
}
