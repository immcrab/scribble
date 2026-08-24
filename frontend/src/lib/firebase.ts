import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBydJIC0fsocxmei-HBI6IH0ZlF-pwOcqg",
  authDomain: "rypotic-playground.firebaseapp.com",
  databaseURL: "https://rypotic-playground-default-rtdb.firebaseio.com",
  projectId: "rypotic-playground",
  storageBucket: "rypotic-playground.firebasestorage.app",
  messagingSenderId: "398595831490",
  appId: "1:398595831490:web:191875e0da44ad3cfa2d5b",
  measurementId: "G-REB028W86W",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// getDatabase() opens a connection the moment it's called, whether or not
// anything ever reads from it — so it's created lazily (only when cloud sync
// actually needs it, i.e. once a user signs in) rather than at module load,
// and the attempt is never allowed to throw past this boundary. If the
// Realtime Database instance isn't provisioned for this Firebase project (or
// the app is offline), sync just doesn't happen — local storage keeps
// working regardless.
let rtdbInstance: Database | null | undefined;
export function getRtdb(): Database | null {
  if (rtdbInstance === undefined) {
    try {
      rtdbInstance = getDatabase(firebaseApp);
    } catch {
      rtdbInstance = null;
    }
  }
  return rtdbInstance;
}
