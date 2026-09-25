import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { GoogleLogo } from "./icons/GoogleLogo";
import { Turnstile, TURNSTILE_RESET_EVENT } from "./Turnstile";
import { useAuthStore, verifyTurnstile } from "../state/authStore";

/** Bot check shown before the Google popup. Any "sign in" button just calls
 * `signInWithGoogle()`; the store opens this dialog until Turnstile passes. The token is
 * verified as soon as the widget produces it so the final click can open the popup
 * synchronously (async work before `signInWithPopup` gets it blocked in some browsers). */
export function SignInGate() {
  const { gateOpen, humanVerifiedAt, markHumanVerified, closeGate, signInWithGoogle, error } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (gateOpen) setCheckError(null);
  }, [gateOpen]);

  const onToken = useCallback(
    (token: string | null) => {
      if (!token) return;
      setChecking(true);
      setCheckError(null);
      verifyTurnstile(token)
        .then(markHumanVerified)
        .catch((err: unknown) => {
          setCheckError(err instanceof Error ? err.message : "Verification failed.");
          window.dispatchEvent(new Event(TURNSTILE_RESET_EVENT));
        })
        .finally(() => setChecking(false));
    },
    [markHumanVerified],
  );

  if (!gateOpen) return null;
  const verified = humanVerifiedAt !== null;
  const message = checkError ?? error;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={closeGate}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-base-600/60 bg-base-850 p-5 shadow-panel animate-fade-in-up"
      >
        <div className="mb-3 flex items-center gap-2 text-accent-400">
          <ShieldCheck size={18} />
          <h3 className="text-sm font-semibold text-white">Verify you're human</h3>
        </div>
        <p className="mb-3 text-sm text-slate-300">Quick check, then continue with Google.</p>
        {!verified && <Turnstile onToken={onToken} />}
        {message && <p className="mb-2 text-xs text-red-400">{message}</p>}
        <button
          type="button"
          disabled={!verified}
          onClick={() => void signInWithGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5 text-sm text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? <Loader2 size={15} className="animate-spin" /> : <GoogleLogo size={15} />} Continue with Google
        </button>
        <button onClick={closeGate} className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}
