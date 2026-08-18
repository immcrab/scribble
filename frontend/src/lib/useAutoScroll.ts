import { useLayoutEffect, useRef } from "react";

/**
 * Keeps a scroll container pinned to the bottom while the user is "following"
 * (i.e. their viewport is already within `threshold` of the bottom).
 *
 * Scrolls *instantly* on each update rather than animating, so a fast token
 * stream stays glued to the viewport without a laggy tween that lags behind
 * the cursor. When the user has scrolled up to read history, the hook stays
 * out of the way so they don't lose their place.
 *
 * Usage in a chat mode:
 *   const scrollRef = useAutoScroll<HTMLDivElement>([chat.messages, generating]);
 *   ...
 *   <div ref={scrollRef} className="flex-1 overflow-y-auto ...">
 */
export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const threshold = 52;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
