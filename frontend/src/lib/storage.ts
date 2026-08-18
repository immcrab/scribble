import type { Chat } from "../types";

const CHATS_KEY = "scribble:chats";
const SETTINGS_KEY = "scribble:settings";

export interface ScribbleSettings {
  workerUrl: string;
  password: string;
}

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
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { workerUrl: DEFAULT_WORKER_URL, password: "" };
    return { workerUrl: DEFAULT_WORKER_URL, password: "", ...JSON.parse(raw) };
  } catch {
    return { workerUrl: DEFAULT_WORKER_URL, password: "" };
  }
}

export function saveSettings(settings: ScribbleSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (clean.length <= 48) return clean || "New chat";
  return clean.slice(0, 48).trimEnd() + "…";
}
