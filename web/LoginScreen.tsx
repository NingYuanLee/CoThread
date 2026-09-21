import type { PersonalProfile } from "./ProfileFields";
import { EmailAuth } from "./EmailAuth";
import { AuthParticleBackground } from "./AuthParticleBackground";
import { UiIcon } from "./ui-icon";
import { CoThreadLogo } from "./workspace-chrome";
import { api } from "./workspace-api";

export { BootScreen } from "./BootScreen";

export function LoginScreen({ onLogin }: { onLogin: (user: PersonalProfile) => void }) {
  return (
    <div className="login">
      <AuthParticleBackground />
      <div className="login-story" onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
        event.currentTarget.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
      }}>
        <div className="brand">
          <CoThreadLogo className="brand-logo" />
          <span>共序 <small>CoThread</small></span>
        </div>
        <h1>
          讨论有承接。
          <br />
          决定有出处。
        </h1>
        <p>
          让人和各自的 AI，在同一个项目里接力。
          <br />
          从一条消息，到一个被确认的版本。
        </p>
        <div className="story-tags">
          <span><UiIcon name="chat" size={13} />团队讨论</span>
          <span><UiIcon name="layers" size={13} />版本沉淀</span>
          <span><UiIcon name="checkCircle" size={13} />协作交付</span>
        </div>
      </div>
      <EmailAuth api={api} onLogin={onLogin} />
      <nav className="login-links">
        <a href="/docs.html" target="_blank" rel="noopener noreferrer">文档</a>
        <a href="/about_us.html" target="_blank" rel="noopener noreferrer">关于我们</a>
      </nav>
    </div>
  );
}
