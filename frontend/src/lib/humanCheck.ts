import { loadSettings } from "./storage";

const STORAGE_KEY = "lofin:human-verified-at";
/** How long a passed Turnstile check unlocks the site before it asks again. */
const HUMAN_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

export function isHumanVerified(): boolean {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    return at > 0 && Date.now() - at < HUMAN_CHECK_TTL_MS;
  } catch {
    return false;
  }
}

export function markHumanVerified(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // storage blocked — the check just repeats next visit
  }
}

/** Has the Worker check a Turnstile token; throws a readable message on failure. */
export async function verifyTurnstile(token: string): Promise<void> {
  const base = loadSettings().workerUrl.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/turnstile/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new Error("Couldn't reach the verification service. Try again.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Verification failed (${res.status}).`);
  }
}
