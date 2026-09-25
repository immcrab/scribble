import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  deleteUser,
  type User,
} from "firebase/auth";
import { ref, remove as dbRemove } from "firebase/database";
import { auth, googleProvider, getRtdb } from "../lib/firebase";
import { useChatStore } from "./chatStore";
import { startUsageSync, stopUsageSync } from "../lib/usage";
import { useTutorStore } from "../lib/tutorStore";
import { loadSettings } from "../lib/storage";

/** How long a passed Turnstile check keeps the Google button unlocked. */
const HUMAN_CHECK_TTL_MS = 4 * 60 * 1000;

/** Has the Worker check a Turnstile token; throws a readable message on failure. */
export async function verifyTurnstile(token: string): Promise<void> {
  const base = loadSettings().workerUrl.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/turnstile/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new Error("Couldn't reach the verification service. Try again.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Verification failed (${res.status}).`);
  }
}

/** Turns Firebase's `auth/...` error codes into short human sentences. */
function authMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/too-many-requests":
      return "Too many attempts. Wait a bit and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/requires-recent-login":
      return "For security, sign out and sign back in, then try again.";
    default:
      return err instanceof Error ? err.message : fallback;
  }
}

interface AuthStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  /** True while the "verify you're human" dialog should be showing. */
  gateOpen: boolean;
  /** Timestamp of the last Turnstile token the Worker accepted. */
  humanVerifiedAt: number | null;
  markHumanVerified: () => void;
  closeGate: () => void;
  /** Opens the Google popup once a Turnstile check has passed; until then it opens the
   * verification dialog instead (which calls this again after the check). */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Reauthenticates (Firebase requires a recent login to delete an account), wipes the
   * user's synced RTDB node, then deletes the Firebase account itself. Local chats/settings
   * are the caller's responsibility to clear (see AccountSection.tsx). */
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  error: null,

  gateOpen: false,
  humanVerifiedAt: null,
  markHumanVerified: () => set({ humanVerifiedAt: Date.now() }),
  closeGate: () => set({ gateOpen: false }),

  signInWithGoogle: async () => {
    const { humanVerifiedAt } = get();
    if (humanVerifiedAt === null || Date.now() - humanVerifiedAt > HUMAN_CHECK_TTL_MS) {
      set({ error: null, gateOpen: true, humanVerifiedAt: null });
      return;
    }
    set({ error: null });
    try {
      await signInWithPopup(auth, googleProvider);
      set({ gateOpen: false });
    } catch (err) {
      set({ error: authMessage(err, "Sign-in failed."), gateOpen: false });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
  },

  deleteAccount: async () => {
    await signInWithPopup(auth, googleProvider);
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");
    const db = getRtdb();
    if (db) {
      try {
        await dbRemove(ref(db, `users/${user.uid}`));
      } catch {
        // best-effort — proceed with account deletion even if the RTDB wipe fails
      }
    }
    await deleteUser(user);
  },
}));

onAuthStateChanged(auth, (user) => {
  useAuthStore.setState({ user, loading: false });
  if (user) {
    useChatStore.getState().startCloudSync(user.uid);
    startUsageSync(user.uid);
    useTutorStore.getState().startSync(user.uid);
  } else {
    useChatStore.getState().stopCloudSync();
    stopUsageSync();
    useTutorStore.getState().stopSync();
  }
});
