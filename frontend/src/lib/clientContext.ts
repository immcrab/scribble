import type { ClientContext } from "../types";

/** How long a resolved geolocation fix stays valid before the next chat turn re-requests one.
 * Long enough to avoid re-prompting/re-querying on every message in a session, short enough
 * that "where am I" answers don't go stale if the user is actually moving around. */
const LOCATION_TTL_MS = 10 * 60 * 1000;

/** Give the browser's location prompt/fix a bounded time to resolve so a slow GPS lock (or a
 * user who never dismisses the permission prompt) can't stall message sending. */
const GEOLOCATION_TIMEOUT_MS = 5000;

let cachedLocation: { value: string | undefined; expiresAt: number } | null = null;
let inFlight: Promise<string | undefined> | null = null;

/** Rounds to ~11km resolution — enough for "nearby", "local time", "what country" style
 * relevance without sending the user's precise position anywhere. */
function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

function requestLocation(): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${roundCoord(pos.coords.latitude)}, ${roundCoord(pos.coords.longitude)} (approximate)`),
      () => resolve(undefined), // permission denied, unavailable, or timed out — just omit location this turn
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: LOCATION_TTL_MS }
    );
  });
}

async function getLocation(): Promise<string | undefined> {
  const now = Date.now();
  if (cachedLocation && cachedLocation.expiresAt > now) return cachedLocation.value;
  if (!inFlight) {
    inFlight = requestLocation().finally(() => {
      inFlight = null;
    });
  }
  const value = await inFlight;
  cachedLocation = { value, expiresAt: now + LOCATION_TTL_MS };
  return value;
}

/**
 * Builds the ambient client-side context sent with every chat request. Local date/time and
 * timezone are always included — reading the system clock needs no permission and isn't
 * sensitive. Location is only requested (and only ever asked of the browser, which prompts
 * the user for permission) when `shareLocation` is on in Settings.
 */
export async function getClientContext(shareLocation: boolean): Promise<ClientContext> {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return {
    localTime,
    timezone,
    location: shareLocation ? await getLocation() : undefined,
  };
}
