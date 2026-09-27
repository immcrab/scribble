import { create } from "zustand";
import type { ModelDef } from "../types";

/**
 * Per-browser model-picker preferences: starred ("favorite") models and the few
 * most recently picked ones. Keys are `"{provider}:{modelId}"` (config/models.ts
 * `modelKey`). Kept out of LofinSettings on purpose — these are UI conveniences,
 * not settings worth cloud-syncing or resolving chats against. (Puter's starred
 * models are different: they live in settings.puterFavoriteModels because a chat
 * can only resolve a Puter model that's been favorited — see ModelSelector.)
 */

const FAVORITES_KEY = "lofin:model-favorites";
const RECENTS_KEY = "lofin:model-recents";
export const MAX_RECENTS = 4;

function read(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked — preference just won't persist
  }
}

interface ModelPrefsState {
  favorites: string[];
  recents: string[];
  toggleFavorite: (key: string) => void;
  pushRecent: (key: string) => void;
}

export const useModelPrefs = create<ModelPrefsState>((set, get) => ({
  favorites: read(FAVORITES_KEY),
  recents: read(RECENTS_KEY),
  toggleFavorite: (key) => {
    const cur = get().favorites;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    write(FAVORITES_KEY, next);
    set({ favorites: next });
  },
  pushRecent: (key) => {
    const next = [key, ...get().recents.filter((k) => k !== key)].slice(0, MAX_RECENTS);
    write(RECENTS_KEY, next);
    set({ recents: next });
  },
}));

export type CapabilityFilter = "vision" | "code" | "reasoning" | "open";

const CODE_HINT = /\b(code|coder|codestral|devstral|codex)\b|-code\b|coder/i;

export function isVisionModel(m: ModelDef): boolean {
  return m.supportsVision || m.capabilities.includes("vision");
}

export function isCodeModel(m: ModelDef): boolean {
  return m.capabilities.includes("code") || CODE_HINT.test(m.modelId) || CODE_HINT.test(m.displayName);
}

export function isReasoningModel(m: ModelDef): boolean {
  return m.capabilities.includes("reasoning");
}
