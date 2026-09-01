/**
 * State for the Tutor page (`/tutor`, see pages/TutorPage.tsx).
 *
 * Deliberately separate from `chatStore`: a tutor session isn't a chat — it's a
 * corpus of the user's own writing, a style profile derived from it, and a
 * conversation that's always anchored to that profile. Keeping it in its own
 * store (and its own localStorage key) means none of it leaks into the sidebar's
 * chat history, cloud sync, or the export/share paths.
 *
 * Everything here is local-only and never uploaded — the samples are the user's
 * personal writing, so they stay in this browser.
 */
import { create } from "zustand";
import type { Attachment, Effort, ModelDef } from "../types";

const TUTOR_KEY = "scribble:tutor:v1";

/** One piece of the user's own work, the raw material the style profile is built from. */
export interface WritingSample {
  id: string;
  title: string;
  /** Plain text. For an image sample this is the transcription a vision model produced. */
  text: string;
  /** Downscaled preview of the uploaded image, kept only so the card can show a thumbnail. */
  imageDataUrl?: string;
  source: "typed" | "file" | "image";
  createdAt: number;
  /** True while a vision model is still reading an uploaded image into `text`. */
  transcribing?: boolean;
  error?: string;
}

/**
 * What the analysis pass extracts from the samples. `instructions` is the part that
 * actually does the work — it's pasted verbatim into the system prompt of every
 * tutor turn; the rest is the human-readable breakdown shown on the profile card.
 */
export interface StyleProfile {
  summary: string;
  tone: string[];
  sentenceRhythm: string;
  vocabulary: string;
  structure: string;
  punctuation: string;
  quirks: string[];
  avoid: string[];
  instructions: string;
  /** Provenance: which samples this was built from, how much text, and by which model. */
  sampleIds: string[];
  wordCount: number;
  modelDisplayName: string;
  createdAt: number;
}

export type TutorTask = "vision" | "math" | "code" | "reasoning" | "writing" | "quick" | "analysis";

export interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  model?: ModelDef;
  /** Which task the router classified this turn as, and the one-line why. */
  task?: TutorTask;
  routeReason?: string;
  effort?: Effort;
  reasoning?: string;
  streaming?: boolean;
  error?: string;
}

interface PersistedTutor {
  samples: WritingSample[];
  profile: StyleProfile | null;
  messages: TutorMessage[];
}

function loadTutor(): PersistedTutor {
  const empty: PersistedTutor = { samples: [], profile: null, messages: [] };
  try {
    const raw = localStorage.getItem(TUTOR_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedTutor>;
    return {
      samples: (parsed.samples ?? []).map((s) => ({ ...s, transcribing: false })),
      profile: parsed.profile ?? null,
      // A reply that was mid-stream when the tab closed can never resume — land it as
      // an error rather than a bubble that spins forever.
      messages: (parsed.messages ?? []).map((m) =>
        m.streaming ? { ...m, streaming: false, error: m.error ?? "Interrupted — the page was closed mid-reply." } : m
      ),
    };
  } catch {
    return empty;
  }
}

/**
 * Writes the whole tutor blob back to localStorage. Samples and image thumbnails make
 * this the one place in the app that can realistically hit the ~5MB quota, so on
 * overflow we drop the oldest conversation turns (the cheapest thing to lose — the
 * samples and the profile are what the user can't reconstruct) and try once more.
 */
function saveTutor(state: PersistedTutor): string | null {
  const attempt = (messages: TutorMessage[]) =>
    localStorage.setItem(TUTOR_KEY, JSON.stringify({ ...state, messages }));
  try {
    attempt(state.messages);
    return null;
  } catch {
    try {
      attempt(state.messages.slice(-10));
      return "Storage was full — older tutor messages were dropped. Your samples and style profile are safe.";
    } catch {
      return "Couldn't save to this browser's storage — it's full. Remove a writing sample to free space.";
    }
  }
}

interface TutorStore extends PersistedTutor {
  /** Set when a save had to prune or failed outright; the page surfaces it once. */
  storageNotice: string | null;
  /** True while the style analysis pass is running. */
  analyzing: boolean;
  addSample: (sample: WritingSample) => void;
  updateSample: (id: string, patch: Partial<WritingSample>) => void;
  removeSample: (id: string) => void;
  setProfile: (profile: StyleProfile | null) => void;
  setAnalyzing: (analyzing: boolean) => void;
  addMessage: (message: TutorMessage) => void;
  updateMessage: (id: string, patch: Partial<TutorMessage>) => void;
  appendMessageContent: (id: string, text: string) => void;
  appendMessageReasoning: (id: string, text: string) => void;
  removeMessagesFrom: (id: string) => void;
  clearConversation: () => void;
  clearNotice: () => void;
  /** Abort controllers for in-flight turns, keyed by message id — same pattern as chatStore. */
  abortControllers: Map<string, AbortController>;
  registerAbort: (id: string, controller: AbortController) => void;
  stop: (id: string) => void;
}

/** Persist after every mutation — write-through, the same approach chatStore uses. */
function persist(state: PersistedTutor): { storageNotice?: string } {
  const notice = saveTutor({ samples: state.samples, profile: state.profile, messages: state.messages });
  return notice ? { storageNotice: notice } : {};
}

export const useTutorStore = create<TutorStore>((set, get) => ({
  ...loadTutor(),
  storageNotice: null,
  analyzing: false,
  abortControllers: new Map(),

  addSample: (sample) =>
    set((s) => {
      const samples = [...s.samples, sample];
      return { samples, ...persist({ ...s, samples }) };
    }),

  updateSample: (id, patch) =>
    set((s) => {
      const samples = s.samples.map((x) => (x.id === id ? { ...x, ...patch } : x));
      return { samples, ...persist({ ...s, samples }) };
    }),

  removeSample: (id) =>
    set((s) => {
      const samples = s.samples.filter((x) => x.id !== id);
      return { samples, ...persist({ ...s, samples }) };
    }),

  setProfile: (profile) => set((s) => ({ profile, ...persist({ ...s, profile }) })),

  setAnalyzing: (analyzing) => set({ analyzing }),

  addMessage: (message) =>
    set((s) => {
      const messages = [...s.messages, message];
      return { messages, ...persist({ ...s, messages }) };
    }),

  updateMessage: (id, patch) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return { messages, ...persist({ ...s, messages }) };
    }),

  // Token-by-token appends fire hundreds of times per reply — mutate in memory only and
  // let the terminal updateMessage({ streaming: false }) do the one localStorage write.
  appendMessageContent: (id, text) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)) })),

  appendMessageReasoning: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, reasoning: (m.reasoning ?? "") + text } : m)),
    })),

  removeMessagesFrom: (id) =>
    set((s) => {
      const index = s.messages.findIndex((m) => m.id === id);
      if (index === -1) return {};
      const messages = s.messages.slice(0, index);
      return { messages, ...persist({ ...s, messages }) };
    }),

  clearConversation: () => set((s) => ({ messages: [], ...persist({ ...s, messages: [] }) })),

  clearNotice: () => set({ storageNotice: null }),

  registerAbort: (id, controller) => {
    get().abortControllers.set(id, controller);
  },

  stop: (id) => {
    get().abortControllers.get(id)?.abort();
    get().abortControllers.delete(id);
  },
}));

/** Words across every sample — drives the "enough to analyze?" threshold on the page. */
export function sampleWordCount(samples: WritingSample[]): number {
  return samples.reduce((n, s) => {
    const trimmed = s.text.trim();
    return n + (trimmed ? trimmed.split(/\s+/).length : 0);
  }, 0);
}

/** Below this there's too little to go on, and the Analyze button stays disabled. */
export const MIN_ANALYSIS_WORDS = 120;
