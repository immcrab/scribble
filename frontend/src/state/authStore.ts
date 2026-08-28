import { create } from "zustand";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  deleteUser,
  type User,
} from "firebase/auth";
import { ref, remove as dbRemove } from "firebase/database";
import { auth, googleProvider, getRtdb } from "../lib/firebase";
import { useChatStore } from "./chatStore";

/** Turns Firebase's `auth/...` error codes into short human sentences. */
function authMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/missing-password":
      return "Enter a password.";
    case "auth/weak-password":
      return "Password is too weak — use at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account with that email already exists. Try signing in.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
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
  /** Set after a successful email sign-up or a "resend"/"reset" action, for the UI to show a confirmation line. */
  notice: string | null;
  clearAuthFeedback: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Creates the account, then fires Firebase's verification email. */
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** Re-sends the verification email to the currently signed-in user. */
  resendVerification: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reauthenticates (Firebase requires a recent login to delete an account), wipes the
   * user's synced RTDB node, then deletes the Firebase account itself. Local chats/settings
   * are the caller's responsibility to clear (see AccountSection.tsx). */
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  error: null,
  notice: null,

  clearAuthFeedback: () => set({ error: null, notice: null }),

  signInWithGoogle: async () => {
    set({ error: null, notice: null });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      set({ error: authMessage(err, "Sign-in failed.") });
    }
  },

  signInWithEmail: async (email, password) => {
    set({ error: null, notice: null });
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      set({ error: authMessage(err, "Sign-in failed.") });
    }
  },

  signUpWithEmail: async (email, password) => {
    set({ error: null, notice: null });
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        await sendEmailVerification(cred.user);
        set({ notice: `Verification email sent to ${cred.user.email}. Check your inbox (and spam).` });
      } catch {
        set({ notice: "Account created, but the verification email couldn't be sent. Try resending it." });
      }
    } catch (err) {
      set({ error: authMessage(err, "Couldn't create the account.") });
    }
  },

  resendVerification: async () => {
    set({ error: null, notice: null });
    const user = auth.currentUser;
    if (!user) {
      set({ error: "Sign in first." });
      return;
    }
    try {
      await sendEmailVerification(user);
      set({ notice: `Verification email sent to ${user.email}. Check your inbox (and spam).` });
    } catch (err) {
      set({ error: authMessage(err, "Couldn't send the verification email.") });
    }
  },

  sendPasswordReset: async (email) => {
    set({ error: null, notice: null });
    const trimmed = email.trim();
    if (!trimmed) {
      set({ error: "Enter your email address first." });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, trimmed);
      set({ notice: `Password-reset email sent to ${trimmed}. Check your inbox (and spam).` });
    } catch (err) {
      set({ error: authMessage(err, "Couldn't send the reset email.") });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
  },

  deleteAccount: async () => {
    const current = auth.currentUser;
    const usesPassword = current?.providerData.some((p) => p.providerId === "password");
    if (usesPassword) {
      // Email/password accounts: rely on the existing session being recent enough.
      // If it isn't, Firebase throws auth/requires-recent-login and authMessage()
      // tells the user to sign out and back in.
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");
      const db = getRtdb();
      if (db) {
        try {
          await dbRemove(ref(db, `users/${user.uid}`));
        } catch {
          // best-effort
        }
      }
      try {
        await deleteUser(user);
      } catch (err) {
        throw new Error(authMessage(err, "Couldn't delete account — try again."));
      }
      return;
    }

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
  } else {
    useChatStore.getState().stopCloudSync();
  }
});
