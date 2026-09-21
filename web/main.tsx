import { createRoot } from "react-dom/client";
import "./theme.css";
import "./style.css";
import { App } from "./App";
import { TipHost } from "./Tip";

createRoot(document.getElementById("root")!).render(<><App /><TipHost /></>);
