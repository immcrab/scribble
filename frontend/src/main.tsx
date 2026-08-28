import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { applyAppearance } from "./lib/appearance";
import { loadSettings } from "./lib/storage";
import { initCatalogSync } from "./lib/catalogSync";

const initialSettings = loadSettings();
applyTheme(initialSettings.theme);
watchSystemTheme(initialSettings.theme);
applyAppearance(initialSettings);

// Subscribe to the shared, admin-curated model catalog (see lib/catalogSync.ts).
initCatalogSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
