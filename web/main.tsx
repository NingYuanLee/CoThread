import { createRoot } from "react-dom/client";
import "./theme.css";
import "./style.css";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { TipHost } from "./Tip";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <TipHost />
  </ErrorBoundary>,
);
