import { UiIcon } from "./ui-icon";
import { CoThreadLogo } from "./workspace-chrome";

export function BootScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="login">
      <div className="brand">
        <CoThreadLogo className="brand-logo" />
        <span>共序 <small>CoThread</small></span>
      </div>
      <p role="status">{error || "正在加载工作空间…"}</p>
      {error && <button onClick={onRetry}><UiIcon name="refresh" size={13} />重新加载</button>}
    </div>
  );
}
