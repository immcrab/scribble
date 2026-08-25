import { Globe } from "lucide-react";

/** Turns on the Worker's per-turn SerpApi lookup (see worker/src/index.ts) —
 * available in every chat mode, not just Agent Mode. */
export function WebSearchToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      title={checked ? "Web search on — every reply starts with a live search" : "Turn on web search for this turn"}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
        checked
          ? "border-accent-500/60 bg-accent-500/10 text-accent-300"
          : "border-base-700/50 text-slate-500 hover:text-slate-300"
      }`}
    >
      <Globe size={11} />
      Web search
    </button>
  );
}
