import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  deleteUser,
  type User,
} from "firebase/auth";
import { ref, remove as dbRemove } from "firebase/database";
import { auth, googleProvider, loadFirestore, getRtdb } from "../lib/firebase";
import { useChatStore } from "./chatStore";
import { startUsageSync, stopUsageSync } from "../lib/usage";
import { useTutorStore } from "../lib/tutorStore";

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
  /** Opens the Google popup (creates the account on first sign-in). The site-wide
   * Turnstile wall (HumanGate) has already run by the time any sign-in button is visible. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Reauthenticates (Firebase requires a recent login to delete an account), wipes the
   * user's synced cloud records, then deletes the Firebase account itself. Local chats/settings
   * are the caller's responsibility to clear (see AccountSection.tsx). */
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      set({ error: authMessage(err, "Sign-in failed.") });
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
    const fs = await loadFirestore();
    if (fs) {
      try {
        await fs.deleteDoc(fs.doc(fs.db, "users", user.uid));
      } catch {
        // best-effort — proceed with account deletion even if the Firestore wipe fails
      }
    }
    await deleteUser(user);
  },
}));

/**
 * End-to-end test hook — lets Playwright render signed-in UI without a real Google popup.
 * `import.meta.env.DEV` is replaced with `false` in production builds, so this block (and
 * the override check below) is removed entirely from what ships; it additionally refuses
 * to install on anything but a local/`.test` host. It only changes what the UI *shows*:
 * every server call still needs a real Firebase ID token, which a fake user can't mint.
 */
let e2eUserOverride = false;
if (import.meta.env.DEV && typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$|\.(test|localhost)$/.test(window.location.hostname)) {
  (window as unknown as { __lofinE2E?: unknown }).__lofinE2E = {
    setUser(fake: { uid: string; email?: string; displayName?: string; emailVerified?: boolean } | null) {
      e2eUserOverride = !!fake;
      const user = fake
        ? ({ photoURL: null, isAnonymous: false, providerData: [], getIdToken: async () => "e2e-token", ...fake } as unknown as User)
        : null;
      useAuthStore.setState({ user, loading: false });
    },
  };
}

onAuthStateChanged(auth, (user) => {
  if (import.meta.env.DEV && e2eUserOverride) return;
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
