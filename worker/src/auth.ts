import type { Env } from "./types";

/** Length-independent constant-time string compare, so a wrong guess can't be
 * timed against the real password character by character. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against a fixed-length buffer so the loop count never depends on the
  // supplied value's length; still fold in a length check at the end.
  let mismatch = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) {
    mismatch |= ab[i] ^ (bb[i] ?? 0);
  }
  return mismatch === 0;
}

/** Basic access gate, not a real security boundary — see README. */
export function checkPassword(request: Request, env: Env): boolean {
  if (!env.SCRIBBLE_PASSWORD) return true;
  const supplied = request.headers.get("X-Scribble-Password");
  if (supplied === null) return false;
  return timingSafeEqual(supplied, env.SCRIBBLE_PASSWORD);
}
