import { useEffect, useState } from "react";

/**
 * Shown in Image mode while a generation is in flight, in place of the generic
 * "Thinking…" prelude. A little buddy paces back and forth across a strip with
 * sparkles rising off the canvas. There's no real progress signal to show
 * (Cloudflare returns in one shot; xKiro is an opaque async job), so this pairs
 * the animation with an honest elapsed-time counter and rotating status copy —
 * not a fake percentage bar.
 */
const STATUS_LINES = [
  "Warming up the canvas",
  "Sketching the shapes",
  "Mixing the colors",
  "Blocking in light and shadow",
  "Painting the details",
  "Adding the finishing touches",
  "Almost there",
];

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function ImageGeneratingLoader({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const line = STATUS_LINES[Math.min(STATUS_LINES.length - 1, Math.floor(elapsed / 6))];

  return (
    <div className="w-full max-w-xs">
      <div className="imggen-scene">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`imggen-spark imggen-spark-${i}`} />
        ))}
        <div className="imggen-buddy">
          <div className="imggen-buddy-flip">
            <div className="imggen-body">
              <span className="imggen-eye" />
              <span className="imggen-eye" />
              <span className="imggen-leg imggen-leg-l" />
              <span className="imggen-leg imggen-leg-r" />
            </div>
          </div>
        </div>
        <div className="imggen-ground" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-xs">
        <span className="thinking-label animate-thinking-shimmer">{line}…</span>
        <span className="shrink-0 tabular-nums text-slate-500">{formatElapsed(elapsed)}</span>
      </div>
    </div>
  );
}
