import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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
