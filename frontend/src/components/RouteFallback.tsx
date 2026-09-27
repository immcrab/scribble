import { Loader2 } from "lucide-react";

/** Suspense fallback while a lazily-loaded page or mode chunk arrives. */
export function RouteFallback({ full = false }: { full?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 text-sm text-slate-500 ${full ? "min-h-dvh bg-base-950" : "h-full"}`}
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      Loading…
    </div>
  );
}
