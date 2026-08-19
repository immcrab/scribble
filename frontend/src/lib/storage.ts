import type { Chat } from "../types";

const CHATS_KEY = "scribble:chats";
const SETTINGS_KEY = "scribble:settings";

export interface ScribbleSettings {
  workerUrl: string;
  password: string;
  /** Overrides DEFAULT_MODEL_ID for new chats when set. */
  defaultModelId?: string;
  /** Enter sends the message; Shift/Ctrl/Cmd+Enter inserts a newline. When false, Ctrl/Cmd+Enter sends instead. */
  sendOnEnter: boolean;
  /** User-forced reduced-motion, independent of the OS-level prefers-reduced-motion. */
  reduceMotion: boolean;
  /** Auto-open the code workspace panel for detected coding requests. */
  autoOpenCode: boolean;
}

const SETTINGS_DEFAULTS: Omit<ScribbleSettings, "workerUrl" | "password"> = {
  sendOnEnter: true,
  reduceMotion: false,
  autoOpenCode: true,
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

// Optional build-time default so a freshly deployed site works without every
// visitor manually pasting a Worker URL into Settings. Never used for
// secrets — only the Worker's public endpoint, which isn't sensitive.
const DEFAULT_WORKER_URL: string = import.meta.env.VITE_WORKER_URL ?? "";

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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "Image chat";
  if (clean.length <= 48) return clean;
  return clean.slice(0, 48).trimEnd() + "…";
}
