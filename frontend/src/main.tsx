import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { applyTheme, watchSystemTheme } from "./lib/theme";
import { loadSettings } from "./lib/storage";

const initialTheme = loadSettings().theme;
applyTheme(initialTheme);
watchSystemTheme(initialTheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
