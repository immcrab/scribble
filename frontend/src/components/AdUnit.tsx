import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const CLIENT_ID = "ca-pub-3679522337620689";

/** A slot id that hasn't been filled in with a real one from the AdSense
 * dashboard yet — all-zeros or a "REPLACE_ME_*" stand-in. AdSense can't fill
 * these, and rendering the unit anyway leaves an empty/blank (often white) box
 * in the layout, so we render nothing until a real id is wired in. */
function isPlaceholderSlot(slot: string): boolean {
  return /^0+$/.test(slot) || /replace/i.test(slot);
}

/**
 * Fixed-size AdSense slot (no "auto"/full-width-responsive format) so the ad
 * never renders larger than `width` x `height` in the first place. The outer
 * div is never touched by the AdSense script — only the inner one is — so it
 * stays a hard clip boundary (overflow: hidden + fixed height) even if
 * AdSense forces `height: auto !important` on the element it does mutate.
 * Without this, an unfilled/dev-mode "auto" ad can expand to 600px+ and push
 * the composer off-screen.
 *
 * When AdSense reports the slot as unfilled (no ad to show), the whole unit
 * collapses to nothing instead of leaving a blank framed box in the UI.
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
  // "pending" → keep the unit at full size so AdSense has room to fill it.
  // "filled" → real ad present. "unfilled" → nothing to show, collapse it.
  const [status, setStatus] = useState<"pending" | "filled" | "unfilled">("pending");

  const placeholder = isPlaceholderSlot(slot);

  useEffect(() => {
    if (placeholder) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle script not loaded yet (e.g. blocked) — ignore
    }

    const ins = insRef.current;
    if (!ins) return;

    const read = () => {
      const s = ins.getAttribute("data-ad-status");
      if (s === "filled" || s === "unfilled") setStatus(s);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    // If the AdSense script never processes the slot at all (blocked, offline,
    // account not approved), stop reserving space for it after a few seconds.
    const timer = window.setTimeout(() => setStatus((cur) => (cur === "pending" ? "unfilled" : cur)), 6000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [placeholder]);

  if (placeholder || status === "unfilled") return null;

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
