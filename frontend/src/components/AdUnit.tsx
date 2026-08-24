import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const CLIENT_ID = "ca-pub-3625273606687332";

/**
 * Fixed-size AdSense slot (no "auto"/full-width-responsive format) so the ad
 * never renders larger than `width` x `height` in the first place. The outer
 * div is never touched by the AdSense script — only the inner one is — so it
 * stays a hard clip boundary (overflow: hidden + fixed height) even if
 * AdSense forces `height: auto !important` on the element it does mutate.
 * Without this, an unfilled/dev-mode "auto" ad can expand to 600px+ and push
 * the composer off-screen.
 */
export function AdUnit({
  slot,
  width = 300,
  height = 100,
  className = "",
}: {
  slot: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle script not loaded yet (e.g. blocked) — ignore
    }
  }, []);

  return (
    <div
      className={`relative mx-auto flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-base-700/40 bg-base-900/30 ${className}`}
      style={{ height, maxWidth: "100%" }}
    >
      <span className="pointer-events-none absolute left-1.5 top-1 z-10 text-[9px] font-medium uppercase tracking-wide text-slate-600">
        Ad
      </span>
      <div style={{ width, height, maxWidth: "100%" }}>
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: "inline-block", width, height }}
          data-ad-client={CLIENT_ID}
          data-ad-slot={slot}
        />
      </div>
    </div>
  );
}
