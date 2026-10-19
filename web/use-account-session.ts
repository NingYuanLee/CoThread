import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonalProfile } from "./ProfileFields";
import { api } from "./workspace-api";
import { showTip } from "./Tip";
import {
  listSavedAccounts,
  mergeKnownAccounts,
  shouldSkipRemember,
  updateSavedAccountProfile,
  saveAccountSession,
  removeSavedAccount,
  clearSavedAccountToken,
  setLoginHint,
  setLoginNotice,
  type SavedAccount,
} from "./saved-accounts";

/** 账号会话拥有身份、记住的账号和切换流程；项目/迭代缓存由工作台随身份失效。 */
export function useAccountSession() {
  const [user, setProfile] = useState<PersonalProfile | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => listSavedAccounts());
  const revision = useRef(0),
    identity = useRef<PersonalProfile | null>(null),
    transition = useRef(false);
  const acceptProfile = useCallback((profile: PersonalProfile | null) => {
    if (identity.current?.id !== profile?.id) revision.current++;
    identity.current = profile;
    if (profile) updateSavedAccountProfile(profile);
    setSavedAccounts(listSavedAccounts());
    setProfile(profile);
  }, []);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let alive = true;
    const refresh = async () => {
      if (shouldSkipRemember(user.id)) return;
      const existing = listSavedAccounts().find((a) => a.id === user.id && a.token);
      if (existing) updateSavedAccountProfile(user);
      else {
        const result = await api("/session/remember", {}, undefined, controller.signal);
        if (!alive) return;
        if (result?.sessionToken && result.id === user.id)
          saveAccountSession(result, result.sessionToken);
      }
      if (!alive) return;
      const accounts = await mergeKnownAccounts((path, data, method) =>
        api(path, data, method, controller.signal),
      );
      if (alive) setSavedAccounts(accounts);
    };
    void refresh().catch(() => {
      if (alive) setSavedAccounts(listSavedAccounts());
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [user?.id]);
  const forgetSavedLogin = useCallback(async (userId: string) => {
    await api("/session/forget", { userId }).catch(() => {});
    removeSavedAccount(userId);
    setSavedAccounts(listSavedAccounts());
  }, []);
  const transact = async (operation: () => Promise<void>) => {
    if (transition.current) return;
    transition.current = true;
    try {
      await operation();
    } finally {
      transition.current = false;
    }
  };
  const logoutCurrent = () =>
    transact(async () => {
      const current = identity.current;
      await api("/logout", {});
      if (current) await forgetSavedLogin(current.id);
      acceptProfile(null);
    });
  const loginAnother = () =>
    transact(async () => {
      await api("/session/detach", {});
      acceptProfile(null);
    });
  const switchSavedAccount = (account: SavedAccount) =>
    transact(async () => {
      const current = identity.current;
      if (!current || current.id === account.id) return;
      const hint = account.email || account.username;
      if (!account.token) {
        setLoginHint(hint);
        await api("/session/detach", {});
        acceptProfile(null);
        return;
      }
      try {
        const profile = await api("/session/switch", { token: account.token });
        acceptProfile(profile);
        showTip("已切换到 " + profile.name);
      } catch (cause) {
        if ((cause as { status?: number }).status !== 401) throw cause;
        clearSavedAccountToken(account.id);
        setLoginHint(hint);
        setLoginNotice("该账号登录已过期，请重新登录");
        await api("/logout", {}).catch(() => {});
        clearSavedAccountToken(current.id);
        acceptProfile(null);
      }
    });
  return {
    user,
    savedAccounts,
    acceptProfile,
    revision,
    forgetSavedLogin,
    logoutCurrent,
    loginAnother,
    switchSavedAccount,
  };
}
