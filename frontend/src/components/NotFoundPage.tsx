import { useState } from "react";
import { LogoMark } from "./Logo";
import { eggToast } from "../lib/easterEggs";

const LOST_LINES = [
  "Nothing lofind here yet",
  "Still nothing. Promise.",
  "Okay, it's really not here",
  "You're very thorough",
];

/**
 * Rendered for any path the SPA doesn't recognize (typos, dead links, stray
 * paths) — see isKnownAppLocation() in lib/router.ts. Deliberately does not
 * touch the chat store or redirect anywhere on its own; "Back to Lofin"
 * is the only way out, same as the static public/404.html shown to crawlers.
 */
export function NotFoundPage({ onHome }: { onHome: () => void }) {
  // Easter egg: poking the logo makes it look around for the missing page.
  const [pokes, setPokes] = useState(0);
  const line = LOST_LINES[Math.min(pokes, LOST_LINES.length - 1)];
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-base-950 p-4">
      <div className="w-full max-w-sm text-center">
        <button
          type="button"
          aria-label="Look for the page"
          onClick={() => {
            const next = pokes + 1;
            setPokes(next);
            if (next === LOST_LINES.length - 1) eggToast("Searched under the couch too.", "404");
          }}
          className="mx-auto mb-7 block animate-float-y rounded-lg"
        >
          <LogoMark key={pokes} size={44} className={`block ${pokes ? "animate-wiggle" : ""}`} />
        </button>
        <p className="mb-3 animate-fade-in-up text-xs font-semibold uppercase tracking-widest text-slate-500">404</p>
        <h1 key={line} className="mb-3 animate-fade-in-up font-serif text-2xl font-light text-white [animation-delay:60ms]">
          {line}
        </h1>
        <p className="mb-7 animate-fade-in-up text-sm leading-relaxed text-slate-400 [animation-delay:120ms]">
          This page doesn't exist, or moved. Head back and pick up where you left off.
        </p>
        <button
          onClick={onHome}
          className="group animate-fade-in-up rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-base-950 transition-all [animation-delay:180ms] hover:bg-accent-400 active:scale-95"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-1">←</span> Back to Lofin
        </button>
      </div>
    </div>
  );
}
