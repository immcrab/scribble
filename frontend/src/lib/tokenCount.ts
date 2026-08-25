/** Rough token estimate (~4 chars/token, the standard GPT-family heuristic) — no
 * provider in this app reliably returns real usage numbers mid-stream, so this
 * drives both the live "thinking" counter and the final per-message count. */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
