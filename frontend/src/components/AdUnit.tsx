import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const CLIENT_ID = "ca-pub-3625273606687332";

/** Sidebar-footer AdSense slot. Fill in `slot` with the ad unit ID from the
 * AdSense dashboard once the site is verified and the unit is created. */
export function AdUnit({ slot }: { slot: string }) {
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // adsbygoogle script not loaded yet (e.g. blocked) — ignore
    }
  }, []);

  return (
    <ins
      ref={insRef}
      className="adsbygoogle block"
      style={{ display: "block" }}
      data-ad-client={CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
