import { useCallback, useState, type ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Turnstile, TURNSTILE_RESET_EVENT } from "./Turnstile";
import { isHumanVerified, markHumanVerified, verifyTurnstile } from "../lib/humanCheck";
import { LogoMark } from "./Logo";

/** Full-page "verify you're human" wall shown before the site loads (like Cloudflare's
 * interstitial). Children only mount once Turnstile passes and the Worker confirms the token;
 * the result is remembered for 12h (lib/humanCheck.ts). */
export function HumanGate({ children }: { children: ReactNode }) {
  const [passed, setPassed] = useState(isHumanVerified);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onToken = useCallback((token: string | null) => {
    if (!token) return;
    setChecking(true);
    setError(null);
    verifyTurnstile(token)
      .then(() => {
        markHumanVerified();
        setPassed(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
        window.dispatchEvent(new Event(TURNSTILE_RESET_EVENT));
      })
      .finally(() => setChecking(false));
  }, []);

  if (passed) return <>{children}</>;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-base-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-base-600/60 bg-base-850 p-6 text-center shadow-panel">
        <div className="mb-4 flex justify-center">
          <LogoMark size={40} />
        </div>
        <div className="mb-1 flex items-center justify-center gap-2 text-accent-400">
          <ShieldCheck size={18} />
          <h1 className="text-base font-semibold text-white">Verify you're human</h1>
        </div>
        <p className="mb-4 text-sm text-slate-400">Quick check before you continue to Lofin.</p>
        <Turnstile action="site_gate" onToken={onToken} />
        {checking && (
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Verifying…
          </p>
        )}
        {error && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-accent-500/50"
            >
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
