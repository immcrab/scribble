/**
 * State for the Tutor page (`/tutor`, see pages/TutorPage.tsx).
 *
 * Deliberately separate from `chatStore`: a tutor session isn't a chat — it's a
 * corpus of the user's own writing, a style profile derived from it, and a
 * conversation that's always anchored to that profile. Keeping it in its own
 * store (and its own RTDB node) means none of it leaks into the sidebar's chat
 * history, the share links, or the export paths.
 *
 * Persistence is Realtime Database, not localStorage — see lib/tutorSync.ts for
 * why and for the merge rules. The practical consequence is that a signed-out
 * visitor's tutor session lives in memory only; the page says so.
 */
import { create } from "zustand";
import {
  clearLegacyLocal,
  emptyBlob,
  pushTutorToCloud,
  readLegacyLocal,
  startTutorSync,
  stopTutorSync,
  type TutorBlob,
} from "./tutorSync";
import type { Attachment, Effort, ModelDef } from "../types";

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

/**
 * Where the tutor's data currently lives:
 *   "local"   — nobody signed in; this session is in memory and won't survive a reload
 *   "loading" — signed in, first read/merge in flight
 *   "synced"  — round-tripping to RTDB
 *   "error"   — signed in but the database is unreachable or refused; still usable, not saved
 */
export type TutorCloudState = "local" | "loading" | "synced" | "error";

interface TutorStore extends TutorBlob {
  cloudState: TutorCloudState;
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
  /** Wired to Firebase auth in state/authStore.ts. */
  startSync: (uid: string) => void;
  stopSync: () => void;
  /** Abort controllers for in-flight turns, keyed by message id — same pattern as chatStore. */
  abortControllers: Map<string, AbortController>;
  registerAbort: (id: string, controller: AbortController) => void;
  stop: (id: string) => void;
}

/** The persisted slice of the store, handed to the sync layer. */
function blobOf(s: TutorBlob): TutorBlob {
  return {
    samples: s.samples,
    profile: s.profile,
    messages: s.messages,
    deletedSampleIds: s.deletedSampleIds,
    updatedAt: s.updatedAt,
  };
}

/**
 * Write-through: stamp the blob and hand it to the debounced RTDB push. A no-op while
 * signed out, which is exactly the "in memory only" behaviour the page warns about.
 */
function persist(next: TutorBlob): { updatedAt: number } {
  const stamped = { ...next, updatedAt: Date.now() };
  pushTutorToCloud(stamped);
  return { updatedAt: stamped.updatedAt };
}

export const useTutorStore = create<TutorStore>((set, get) => ({
  // Boot from the old localStorage key if this browser still has one, so the move to
  // RTDB doesn't strand anyone's samples — it's pushed up and deleted on next sign-in.
  ...(readLegacyLocal() ?? emptyBlob()),
  cloudState: "local",
  analyzing: false,
  abortControllers: new Map(),

  addSample: (sample) =>
    set((s) => {
      const samples = [...s.samples, sample];
      return { samples, ...persist({ ...blobOf(s), samples }) };
    }),

  updateSample: (id, patch) =>
    set((s) => {
      const samples = s.samples.map((x) => (x.id === id ? { ...x, ...patch } : x));
      return { samples, ...persist({ ...blobOf(s), samples }) };
    }),

  // Tombstoned rather than just dropped, so the merge in tutorSync.ts can't bring it
  // back from a stale copy on another device.
  removeSample: (id) =>
    set((s) => {
      const samples = s.samples.filter((x) => x.id !== id);
      const deletedSampleIds = s.deletedSampleIds.includes(id) ? s.deletedSampleIds : [...s.deletedSampleIds, id];
      return { samples, deletedSampleIds, ...persist({ ...blobOf(s), samples, deletedSampleIds }) };
    }),

  setProfile: (profile) => set((s) => ({ profile, ...persist({ ...blobOf(s), profile }) })),

  setAnalyzing: (analyzing) => set({ analyzing }),

  addMessage: (message) =>
    set((s) => {
      const messages = [...s.messages, message];
      return { messages, ...persist({ ...blobOf(s), messages }) };
    }),

  updateMessage: (id, patch) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return { messages, ...persist({ ...blobOf(s), messages }) };
    }),

  // Token-by-token appends fire hundreds of times per reply — mutate in memory only and
  // let the terminal updateMessage({ streaming: false }) do the one cloud write.
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
      return { messages, ...persist({ ...blobOf(s), messages }) };
    }),

  clearConversation: () => set((s) => ({ messages: [], ...persist({ ...blobOf(s), messages: [] }) })),

  startSync: (uid) => {
    set({ cloudState: "loading" });
    void startTutorSync(
      uid,
      () => blobOf(get()),
      (blob, state) => set({ ...blob, cloudState: state }),
      // Only drop the legacy localStorage copy once its contents have actually landed
      // in RTDB, so a failed first push can't lose it.
      clearLegacyLocal
    );
  },

  // Signing out drops the data from memory as well as detaching the listener: with no
  // local persistence, leaving it in place would only mean it merged into whichever
  // account signed in next on this browser.
  //
  // Guarded on `cloudState`, because Firebase also fires its auth callback with a null
  // user on every cold load — clearing unconditionally there would wipe a session that
  // had just booted from the legacy localStorage key before anyone signed in.
  stopSync: () => {
    stopTutorSync();
    if (get().cloudState === "local") return;
    set({ ...emptyBlob(), cloudState: "local" });
  },

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
