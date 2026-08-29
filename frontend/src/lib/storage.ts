import type { Chat, CustomProvider, Effort, MemoryEntry, ModelDef, Project } from "../types";
import type { Theme } from "./theme";

const CHATS_KEY = "scribble:chats";
const SETTINGS_KEY = "scribble:settings";
const CONSENT_KEY = "scribble:consent";
const MEMORIES_KEY = "scribble:memories";
const PROJECTS_KEY = "scribble:projects";

export interface ScribbleSettings {
  workerUrl: string;
  password: string;
  /** Overrides DEFAULT_MODEL_ID for new chats when set. */
  defaultModelId?: string;
  /** Image-mode backend — id from config/imageModels.ts. Defaults to DEFAULT_IMAGE_MODEL_ID when unset. */
  imageModelId?: string;
  /** Image-mode style preset — id from config/imageStyles.ts. "none"/unset sends the prompt untouched. */
  imageStyleId?: string;
  /** Text-to-speech voice id (xKiro), persisted across Speech-mode sessions. Falls back to the
   * first voice the /api/speech/voices list returns when unset. */
  speechVoiceId?: string;
  /** Text-to-speech output container — "mp3" (default), "wav", "opus", "aac", "flac". */
  speechFormat?: string;
  /** Text-to-speech playback rate sent to xKiro, 0.25–4.0. Defaults to 1. */
  speechSpeed?: number;
  /** Enter sends the message; Shift/Ctrl/Cmd+Enter inserts a newline. When false, Ctrl/Cmd+Enter sends instead. */
  sendOnEnter: boolean;
  /** User-forced reduced-motion, independent of the OS-level prefers-reduced-motion. */
  reduceMotion: boolean;
  /** Auto-open the code workspace panel for detected coding requests. */
  autoOpenCode: boolean;
  /** When true, every chat turn (any mode) lets the Worker decide — via a fast
   * classification call — whether the reply needs a live web search, and run one
   * automatically if so. See worker/src/adapters/search.ts. */
  autoWebSearch: boolean;
  /** Consent state for sending an IP-derived approximate location (city-level, via ipapi.co —
   * no browser geolocation prompt) with each chat request — see lib/clientContext.ts.
   * "unset": never asked yet, in-site popup will ask once. "granted"/"denied": user's answer,
   * from the popup or toggled directly in Settings. If "denied", the popup asks again the next
   * time the user sends a message that looks location-related (e.g. "where am I"). Local
   * date/time and timezone are always sent regardless, since neither reveals anything sensitive. */
  locationConsent: "unset" | "granted" | "denied";
  /** Light/Dark/System — applied via frontend/src/lib/theme.ts. */
  theme: Theme;
  /** Global default reasoning effort for new chats — overridable per-chat (Chat.effort). */
  effort: Effort;
  /** User-added OpenAI-compatible connections (name + base URL + API key) — never round-tripped to cloud sync, same as `password`. */
  customProviders: CustomProvider[];
  /** User-added models, each pointing at a built-in provider or one of `customProviders` — same local-only treatment as `customProviders`. */
  customModels: ModelDef[];
  /** Models the user has starred out of Puter.js's full live catalog (800+, see lib/puterClient.ts's
   * listPuterModels) — only these show under the Puter.js group by default instead of the whole catalog. */
  puterFavoriteModels: ModelDef[];
  /** Chat text size — see the `data-text-size` attribute applied in App.tsx and styles/index.css. */
  textSize: "small" | "medium" | "large";
  /** Message bubble spacing — see the `data-density` attribute applied in App.tsx. */
  density: "comfortable" | "compact";
  /** UI font family — id from lib/appearance.ts's FONT_OPTIONS, applied as the `data-font`
   * attribute on <html> (styles/index.css maps each id to a font stack). */
  fontFamily: string;
  /** Heavier base font weight across the whole UI — `data-bold="true"` on <html>. */
  boldText: boolean;
  /** Color theme — id from lib/appearance.ts's THEME_PALETTE_OPTIONS, applied as `data-palette`
   * on <html>. Independent of `theme` (light/dark/system), which stays the light/dark mode. */
  themePalette: string;
  /** Language Scribble should always reply in, regardless of the language the user writes in.
   * "auto" = match the user's language (default). Any other value is the English name of the
   * language ("Spanish", "Japanese", …), sent in ClientContext.replyLanguage and folded into the
   * system prompt — see worker/src/adapters/base.ts's buildSystemPrompt. */
  replyLanguage: string;
  /** User-authored instructions appended to the base system prompt for every request —
   * see worker/src/adapters/base.ts's buildSystemPrompt. */
  customSystemPrompt: string;
  /** Play a short chime when an assistant reply finishes streaming — see lib/notificationSound.ts. */
  notificationSound: boolean;
  /** When a reply is cut off at the model's output-token limit, automatically resume it in
   * place (appending, same as the manual "Continue" button) until it finishes or a small
   * round cap is hit. On by default. See lib/runStream.ts. */
  autoContinueTruncated: boolean;
  /** Opt-in: lets the AI remember facts across chats (explicit "remember that..." asks, or
   * durable facts it decides on its own are worth keeping) and recall them in later chats.
   * Off by default — same opt-in spirit as locationConsent. See lib/cloudSync.ts's memoriesJson
   * and worker/src/adapters/memory.ts. */
  memoryEnabled: boolean;
  /** Set whenever a genuine local edit is made — lets cloud sync pick the newer side on merge. 0 means "never explicitly saved". */
  updatedAt: number;
}

const SETTINGS_DEFAULTS: Omit<ScribbleSettings, "workerUrl" | "password"> = {
  sendOnEnter: true,
  reduceMotion: false,
  autoOpenCode: true,
  autoWebSearch: true,
  locationConsent: "unset",
  theme: "dark",
  effort: "medium",
  customProviders: [],
  customModels: [],
  puterFavoriteModels: [],
  textSize: "medium",
  density: "comfortable",
  fontFamily: "inter",
  boldText: false,
  themePalette: "mono",
  replyLanguage: "auto",
  customSystemPrompt: "",
  notificationSound: false,
  autoContinueTruncated: true,
  memoryEnabled: false,
  updatedAt: 0,
};

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Chat[];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {
    // storage full or unavailable — chat still works in-memory for this session
  }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // storage full or unavailable — projects still work in-memory for this session
  }
}

export function loadMemories(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MemoryEntry[];
  } catch {
    return [];
  }
}

export function saveMemories(memories: MemoryEntry[]): void {
  try {
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(memories));
  } catch {
    // storage full or unavailable — memory still works in-memory for this session
  }
}

// Optional build-time default so a freshly deployed site works without every
// visitor manually pasting a Worker URL into Settings. Never used for
// secrets — only the Worker's public endpoint, which isn't sensitive.
const DEFAULT_WORKER_URL: string = import.meta.env.VITE_WORKER_URL ?? "https://scribble-worker.imcrabfr.workers.dev";

export function loadSettings(): ScribbleSettings {
  const base = { workerUrl: DEFAULT_WORKER_URL, password: "", ...SETTINGS_DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    return { ...base, ...JSON.parse(raw) };
  } catch {
    return base;
  }
}

export function saveSettings(settings: ScribbleSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage full or unavailable — settings still work in-memory for this session
  }
}

/** Per-browser gate for the terms/privacy consent screen — deliberately kept out of
 * ScribbleSettings so it never round-trips through cloud sync/merge. */
export function hasAcceptedTerms(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAcceptedTerms(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // if storage is unavailable, the gate will just show again next load
  }
}

/** Wipes every localStorage key Scribble owns — chats, settings, consent flag.
 * Used by Settings → Account's "Clear local data" and as part of account deletion. */
export function clearAllLocalData(): void {
  try {
    localStorage.removeItem(CHATS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(MEMORIES_KEY);
    localStorage.removeItem(PROJECTS_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "Image chat";
  if (clean.length <= 48) return clean;
  return clean.slice(0, 48).trimEnd() + "…";
}
