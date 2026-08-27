import type { ScribbleSettings } from "./storage";

/**
 * Font / color-palette / bold appearance options and the single function that
 * applies them to <html> as data attributes. styles/index.css keys the actual
 * font stacks and palette variables off those attributes.
 *
 * Applied once synchronously before first paint (main.tsx) and again whenever
 * the relevant settings change (App.tsx), same pattern as lib/theme.ts.
 */

export interface FontOption {
  id: string;
  label: string;
  /** Short note shown under the option in the dropdown. */
  note: string;
}

/** `id` matches the `:root[data-font="…"]` blocks in styles/index.css. */
export const FONT_OPTIONS: FontOption[] = [
  { id: "inter", label: "Inter", note: "Default — clean modern sans" },
  { id: "system", label: "System UI", note: "Your OS's native font" },
  { id: "claude-serif", label: "Claude Serif", note: "Warm book serif, like Claude" },
  { id: "newsreader", label: "Newsreader", note: "Elegant editorial serif" },
  { id: "lora", label: "Lora", note: "Rounded contemporary serif" },
  { id: "plex", label: "IBM Plex Sans", note: "Neutral technical sans" },
  { id: "atkinson", label: "Atkinson Hyperlegible", note: "High-legibility, accessible" },
  { id: "space-grotesk", label: "Space Grotesk", note: "Geometric, slightly bolder" },
  { id: "georgia", label: "Georgia", note: "Classic web serif" },
  { id: "mono", label: "Monospace", note: "Fixed-width, terminal feel" },
];

export interface PaletteOption {
  id: string;
  label: string;
  /** Swatch color for the picker (any valid CSS color). */
  swatch: string;
}

/** `id` matches the `:root[data-palette="…"]` blocks in styles/index.css. */
export const THEME_PALETTE_OPTIONS: PaletteOption[] = [
  { id: "mono", label: "Mono", swatch: "#e7e1da" },
  { id: "blue", label: "Blue", swatch: "#3b82f6" },
  { id: "violet", label: "Violet", swatch: "#8b5cf6" },
  { id: "emerald", label: "Emerald", swatch: "#10b981" },
  { id: "rose", label: "Rose", swatch: "#f43f5e" },
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
  { id: "cyan", label: "Cyan", swatch: "#06b6d4" },
];

export interface LanguageOption {
  /** Stored value + the English name sent to the model ("auto" means "match the user"). */
  id: string;
  /** Shown in the dropdown, in the language itself. */
  label: string;
}

export const REPLY_LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "auto", label: "Auto (match my language)" },
  { id: "English", label: "English" },
  { id: "Spanish", label: "Español" },
  { id: "French", label: "Français" },
  { id: "German", label: "Deutsch" },
  { id: "Portuguese", label: "Português" },
  { id: "Italian", label: "Italiano" },
  { id: "Dutch", label: "Nederlands" },
  { id: "Polish", label: "Polski" },
  { id: "Russian", label: "Русский" },
  { id: "Ukrainian", label: "Українська" },
  { id: "Turkish", label: "Türkçe" },
  { id: "Arabic", label: "العربية" },
  { id: "Hebrew", label: "עברית" },
  { id: "Hindi", label: "हिन्दी" },
  { id: "Bengali", label: "বাংলা" },
  { id: "Indonesian", label: "Bahasa Indonesia" },
  { id: "Vietnamese", label: "Tiếng Việt" },
  { id: "Thai", label: "ไทย" },
  { id: "Chinese (Simplified)", label: "简体中文" },
  { id: "Chinese (Traditional)", label: "繁體中文" },
  { id: "Japanese", label: "日本語" },
  { id: "Korean", label: "한국어" },
];

const FONT_IDS = new Set(FONT_OPTIONS.map((f) => f.id));
const PALETTE_IDS = new Set(THEME_PALETTE_OPTIONS.map((p) => p.id));

/** Sets `data-font`, `data-bold` and `data-palette` on <html>. Falls back to the
 * defaults for anything missing/unknown (e.g. settings synced from an older client). */
export function applyAppearance(settings: Pick<ScribbleSettings, "fontFamily" | "boldText" | "themePalette">): void {
  const root = document.documentElement;
  root.dataset.font = FONT_IDS.has(settings.fontFamily) ? settings.fontFamily : "inter";
  root.dataset.palette = PALETTE_IDS.has(settings.themePalette) ? settings.themePalette : "mono";
  root.dataset.bold = settings.boldText ? "true" : "false";
}
