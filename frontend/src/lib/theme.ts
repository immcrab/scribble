export type Theme = "light" | "dark" | "system";

const media = window.matchMedia?.("(prefers-color-scheme: light)");

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") return media?.matches ? "light" : "dark";
  return theme;
}

/** Adds/removes the `.light` class on <html> that src/styles/index.css keys its
 * theme CSS variables off of. Called once synchronously before first paint
 * (main.tsx) and again whenever settings.theme or the OS preference changes. */
export function applyTheme(theme: Theme): void {
  const resolved = resolve(theme);
  document.documentElement.classList.toggle("light", resolved === "light");
  document.documentElement.style.colorScheme = resolved;
}

let systemListenerAttached = false;
let currentTheme: Theme = "dark";

/** Keeps the applied theme in sync with the OS preference while theme === "system". */
export function watchSystemTheme(theme: Theme): void {
  currentTheme = theme;
  if (systemListenerAttached || !media) return;
  systemListenerAttached = true;
  media.addEventListener("change", () => {
    if (currentTheme === "system") applyTheme("system");
  });
}
