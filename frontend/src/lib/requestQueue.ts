import { useChatStore } from "../state/chatStore";

/**
 * Global pacing gate for outgoing chat requests.
 *
 * Every stream acquires a slot here before it fires. Slots are handed out one at
 * a time, FIFO, each at least `settings.requestSpacingSec` seconds after the
 * previous one actually started. A burst point — Battle's two panes, Side by
 * Side, an Agent Mode tool loop, the project broadcast bar, auto-continue — then
 * drains in order instead of hitting the upstream provider all at once and
 * tripping its requests-per-minute limit.
 *
 * With spacing at 0 (the default) this is a no-op: the chain still serializes
 * acquisition for an instant but imposes no wait.
 */

let lastStartedAt = 0;
let chain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a request slot. Resolves once the caller may fire its request.
 *
 * `onWait` is invoked with the whole-second countdown while the slot is held
 * back, then once more with 0 immediately before it's granted — the caller uses
 * it to show a "starting in Ns…" note on the pending message. If `signal`
 * aborts, the wait is cut short and the slot resolves early (the caller is
 * expected to re-check the signal and bail).
 */
export function acquireRequestSlot(signal?: AbortSignal, onWait?: (secondsLeft: number) => void): Promise<void> {
  const run = chain.then(async () => {
    const spacingMs = Math.max(0, useChatStore.getState().settings.requestSpacingSec || 0) * 1000;
    if (spacingMs > 0) {
      let remaining = lastStartedAt + spacingMs - Date.now();
      while (remaining > 0 && !signal?.aborted) {
        onWait?.(Math.ceil(remaining / 1000));
        await sleep(Math.min(remaining, 1000));
        remaining = lastStartedAt + spacingMs - Date.now();
      }
      onWait?.(0);
    }
    lastStartedAt = Date.now();
  });
  // The chain must survive a waiter that throws or aborts, or every later
  // request would reject too.
  chain = run.catch(() => {});
  return run;
}
