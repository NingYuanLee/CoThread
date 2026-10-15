import type { PersonalProfile } from "./ProfileFields";

const STORAGE_KEY = "cothread-accounts";
const HINT_KEY = "cothread-login-hint";
const NOTICE_KEY = "cothread-login-notice";
const SKIP_KEY = "cothread-skip-remember";
const LIMIT = 8;

export type SavedAccount = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  avatar: string | null;
  userNumber: number;
  token: string;
  savedAt: string;
};

function isAccount(value: unknown): value is SavedAccount {
  if (!value || typeof value !== "object") return false;
  const row = value as SavedAccount;
  return (
    typeof row.id === "string" && typeof row.username === "string" && typeof row.name === "string"
  );
}

export function listSavedAccounts(): SavedAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isAccount).slice(0, LIMIT);
  } catch {
    return [];
  }
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts.slice(0, LIMIT)));
}

export function saveAccountSession(
  profile: Pick<PersonalProfile, "id" | "username" | "name" | "email" | "avatar" | "user_number">,
  token: string,
) {
  if (!token) return;
  const next: SavedAccount = {
    id: profile.id,
    username: profile.username,
    name: profile.name,
    email: profile.email ?? null,
    avatar: profile.avatar ?? null,
    userNumber: Number(profile.user_number || 0),
    token,
    savedAt: new Date().toISOString(),
  };
  const accounts = listSavedAccounts().filter((item) => item.id !== profile.id);
  accounts.unshift(next);
  try {
    writeSavedAccounts(accounts);
  } catch {
    /* 头像过大时放弃写入，不影响当前登录。 */
  }
}

export function updateSavedAccountProfile(
  profile: Pick<PersonalProfile, "id" | "username" | "name" | "email" | "avatar">,
) {
  const accounts = listSavedAccounts();
  const index = accounts.findIndex((item) => item.id === profile.id);
  if (index < 0) return;
  accounts[index] = {
    ...accounts[index],
    username: profile.username,
    name: profile.name,
    email: profile.email ?? null,
    avatar: profile.avatar ?? accounts[index].avatar,
  };
  try {
    writeSavedAccounts(accounts);
  } catch {
    /* 资料缓存失败不影响保存。 */
  }
}

export function removeSavedAccount(id: string) {
  try {
    writeSavedAccounts(listSavedAccounts().filter((item) => item.id !== id));
  } catch {
    /* ignore */
  }
}

export function clearSavedAccountToken(id: string) {
  try {
    writeSavedAccounts(
      listSavedAccounts().map((item) => (item.id === id ? { ...item, token: "" } : item)),
    );
  } catch {
    /* ignore */
  }
}

export function setLoginHint(identifier: string) {
  if (!identifier) return;
  sessionStorage.setItem(HINT_KEY, identifier);
}

export function takeLoginHint() {
  const value = sessionStorage.getItem(HINT_KEY) || "";
  sessionStorage.removeItem(HINT_KEY);
  return value;
}

export function setLoginNotice(message: string) {
  if (!message) return;
  sessionStorage.setItem(NOTICE_KEY, message);
}

export function takeLoginNotice() {
  const value = sessionStorage.getItem(NOTICE_KEY) || "";
  sessionStorage.removeItem(NOTICE_KEY);
  return value;
}

export async function mergeKnownAccounts(api: (path: string, data?: unknown, method?: string) => Promise<any>) {
  const known = await api("/session/known-accounts", undefined, "GET");
  const byId = new Map(listSavedAccounts().map((item) => [item.id, item]));
  for (const profile of Array.isArray(known) ? known : []) {
    const current = byId.get(profile.id);
    byId.set(profile.id, {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      email: profile.email ?? null,
      avatar: profile.avatar ?? current?.avatar ?? null,
      userNumber: Number(profile.user_number || current?.userNumber || 0),
      token: current?.token || "",
      savedAt: current?.savedAt || new Date().toISOString(),
    });
  }
  const merged = [...byId.values()];
  try {
    writeSavedAccounts(merged);
  } catch {
    /* 列表过大时仍返回内存结果。 */
  }
  return merged;
}

export function setSkipRemember(userId: string) {
  if (!userId) return;
  sessionStorage.setItem(SKIP_KEY, userId);
}

export function clearSkipRemember() {
  sessionStorage.removeItem(SKIP_KEY);
}

export function shouldSkipRemember(userId: string) {
  return !!userId && sessionStorage.getItem(SKIP_KEY) === userId;
}

export function acceptSessionResult<T extends { sessionToken?: string; id?: string }>(result: T, remember = true) {
  if (!remember && result?.id) {
    setSkipRemember(result.id);
    removeSavedAccount(result.id);
  } else {
    clearSkipRemember();
    if (result?.sessionToken && result.id) {
      saveAccountSession(result as unknown as PersonalProfile, result.sessionToken);
    }
  }
  const { sessionToken: _token, ...profile } = result;
  return profile;
}
