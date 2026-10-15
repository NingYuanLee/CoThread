import { UiIcon } from "./ui-icon";
import type { SavedAccount } from "./saved-accounts";

export function AccountSwitchList({
  accounts,
  currentId,
  busy,
  onSwitch,
  onLogout,
  onClear,
  variant = "rows",
}: {
  accounts: SavedAccount[];
  currentId?: string;
  busy?: boolean;
  onSwitch: (account: SavedAccount) => void;
  onLogout?: () => void;
  onClear?: (account: SavedAccount) => void;
  variant?: "rows" | "tiles";
}) {
  if (!accounts.length) {
    return <p className="muted">登录其他账号后，会保存在这台浏览器，可在此切换。</p>;
  }
  if (variant === "tiles") {
    return (
      <div className="account-switch-list tiles" role="list" aria-label="快捷登录">
        <p className="account-switch-title">快捷登录</p>
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            role="listitem"
            className="account-switch-tile"
            disabled={busy}
            aria-label={account.name}
            onClick={() => onSwitch(account)}
          >
            <span className="avatar">
              {account.avatar ? <img src={account.avatar} alt="" /> : account.name.slice(0, 1)}
            </span>
            <strong>{account.name}</strong>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="account-switch-list" role="list">
      {accounts.map((account) => {
        const current = account.id === currentId;
        const copy = (
          <>
            <span className="avatar">
              {account.avatar ? <img src={account.avatar} alt="" /> : account.name.slice(0, 1)}
            </span>
            <span className="account-switch-copy">
              <strong>{account.name}</strong>
              <small>
                {account.username}
                {account.email ? " · " + account.email : ""}
              </small>
            </span>
          </>
        );
        if (current) {
          return (
            <div
              key={account.id}
              role="listitem"
              className="account-switch-item current"
              aria-current="true"
            >
              {copy}
              {onLogout ? (
                <button type="button" className="account-switch-action" disabled={busy} onClick={onLogout}>
                  <UiIcon name="logout" size={13} />
                  退出并清除账号
                </button>
              ) : (
                <em>当前</em>
              )}
            </div>
          );
        }
        return (
          <div key={account.id} role="listitem" className="account-switch-item">
            {copy}
            <span className="account-switch-actions">
              <button
                type="button"
                className="account-switch-action"
                disabled={busy}
                onClick={() => onSwitch(account)}
              >
                <UiIcon name={account.token ? "refresh" : "login"} size={13} />
                {account.token ? "切换账号" : "重新登录"}
              </button>
              {onClear ? (
                <button
                  type="button"
                  className="account-switch-action"
                  disabled={busy}
                  onClick={() => onClear(account)}
                >
                  <UiIcon name="trash" size={13} />
                  清除账号
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
