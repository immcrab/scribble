import { LogoMark } from "./Logo";
import { setAcceptedTerms } from "../lib/storage";

/**
 * Blocks the entire app until the user accepts the Terms/Privacy Policy — rendered
 * instead of everything else (see App.tsx), not as an overlay on top of it, so there's
 * no way to interact with the app underneath before agreeing.
 */
export function ConsentGate({ onAccept }: { onAccept: () => void }) {
  const accept = () => {
    setAcceptedTerms();
    onAccept();
  };

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-base-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-base-600/60 bg-base-850 p-6 text-center shadow-panel animate-fade-in-up">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow">
          <LogoMark size={18} className="text-base-950" />
        </div>
        <h1 className="mb-2 font-serif text-xl font-semibold text-white">Welcome to Scribble</h1>
        <p className="mb-5 text-sm leading-relaxed text-slate-400">
          Scribble is an independently run AI playground. By continuing, you agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-400 underline underline-offset-2 hover:text-accent-500">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-400 underline underline-offset-2 hover:text-accent-500">
            Privacy Policy
          </a>
          .
        </p>
        <button
          onClick={accept}
          className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
        >
          I agree, continue
        </button>
      </div>
    </div>
  );
}
