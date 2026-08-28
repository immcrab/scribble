import { useEffect, useState } from "react";

/**
 * Shown in Speech mode while xKiro synthesizes audio, in place of the generic
 * "Thinking…" prelude. A bouncing equalizer paired with an honest elapsed-time
 * counter and rotating status copy — xKiro streams the audio back in one shot
 * with no progress signal, so there's no real percentage to show.
 */
const STATUS_LINES = [
  "Warming up the voice",
  "Reading the script",
  "Shaping the words",
  "Adding intonation",
  "Rendering the audio",
  "Almost there",
];

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function SpeechGeneratingLoader({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const line = STATUS_LINES[Math.min(STATUS_LINES.length - 1, Math.floor(elapsed / 5))];

  return (
    <div className="w-full max-w-xs">
      <div className="ttsgen-scene">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="ttsgen-bar" />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-xs">
        <span className="thinking-label animate-thinking-shimmer">{line}…</span>
        <span className="shrink-0 tabular-nums text-slate-500">{formatElapsed(elapsed)}</span>
      </div>
    </div>
  );
}
