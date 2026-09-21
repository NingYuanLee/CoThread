import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./workspace-api";
import { BootScreen } from "./BootScreen";
import { LoginScreen } from "./LoginScreen";
import type { PersonalProfile } from "./ProfileFields";

const loadWorkspaceApp = () => import("./WorkspaceApp");
const WorkspaceApp = lazy(() =>
  loadWorkspaceApp().then((module) => ({ default: module.WorkspaceApp })),
);

export function App() {
  const [phase, setPhase] = useState<"boot" | "login" | "app">("boot");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadWorkspaceApp();
    const controller = new AbortController();
    void api("/me", undefined, undefined, controller.signal)
      .then(() => setPhase("app"))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if ((cause as { status?: number }).status === 401) {
          setPhase("login");
          return;
        }
        setError((cause as Error).message || "工作空间加载失败");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return <BootScreen error={error} onRetry={() => window.location.reload()} />;
  }
  if (phase === "boot") {
    return <BootScreen error="" onRetry={() => window.location.reload()} />;
  }
  if (phase === "login") {
    return (
      <LoginScreen
        onLogin={(_user: PersonalProfile) => {
          setPhase("app");
        }}
      />
    );
  }
  return (
    <Suspense fallback={<BootScreen error="" onRetry={() => window.location.reload()} />}>
      <WorkspaceApp />
    </Suspense>
  );
}
