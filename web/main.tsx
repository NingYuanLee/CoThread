import { createRoot } from "react-dom/client";
import "./theme.css";
import "./style.css";
/* 主题微调层：必须在 theme.css 之后，且晚于业务样式以覆盖组件级规则。 */
import "./theme-overrides.css";
import "./theme-fallback-map.css";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { TipHost } from "./Tip";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <TipHost />
  </ErrorBoundary>,
);
