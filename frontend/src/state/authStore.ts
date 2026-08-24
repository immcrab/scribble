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

interface AuthStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
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

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Sign-in failed." });
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
  } else {
    useChatStore.getState().stopCloudSync();
  }
});
