import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HumanGate } from "./components/HumanGate";
import "./styles/index.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { applyAppearance } from "./lib/appearance";
import { loadSettings } from "./lib/storage";
import { initCatalogSync } from "./lib/catalogSync";
import { isDocsSite } from "./lib/router";

const initialSettings = loadSettings();
applyTheme(initialSettings.theme);
watchSystemTheme(initialSettings.theme);
applyAppearance(initialSettings);

// Subscribe to the shared, admin-curated model catalog (see lib/catalogSync.ts).
initCatalogSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isDocsSite() ? (
      // Public documentation never sends model requests or exposes account
      // actions, so it should stay readable to visitors and crawlers without
      // entering the chat app's Turnstile gate.
      <App />
    ) : (
      <HumanGate>
        <App />
      </HumanGate>
    )}
  </React.StrictMode>
);
