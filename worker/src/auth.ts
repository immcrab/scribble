import type { Env } from "./types";

/** Basic access gate, not a real security boundary — see README. */
export function checkPassword(request: Request, env: Env): boolean {
  if (!env.SCRIBBLE_PASSWORD) return true;
  const supplied = request.headers.get("X-Scribble-Password");
  return supplied === env.SCRIBBLE_PASSWORD;
}
