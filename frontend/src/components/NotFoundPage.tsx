import { LogoMark } from "./Logo";

/**
 * Rendered for any path the SPA doesn't recognize (typos, dead links, stray
 * paths) — see isKnownAppLocation() in lib/router.ts. Deliberately does not
 * touch the chat store or redirect anywhere on its own; "Back to Scribble"
 * is the only way out, same as the static public/404.html shown to crawlers.
 */
export function NotFoundPage({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-base-950 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow">
          <LogoMark size={20} className="text-base-950" />
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">404</p>
        <h1 className="mb-3 font-serif text-2xl font-light text-white">Nothing scribbled here yet</h1>
        <p className="mb-7 text-sm leading-relaxed text-slate-400">
          This page doesn't exist, or moved. Head back and pick up where you left off.
        </p>
        <button
          onClick={onHome}
          className="rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
        >
          ← Back to Scribble
        </button>
      </div>
    </div>
  );
}
