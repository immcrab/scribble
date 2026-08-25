import type { ClientContext } from "../types";
import type { ScribbleSettings } from "./storage";
import { useLocationPrompt } from "./locationPrompt";

/** How long a resolved IP-geolocation lookup stays valid before the next chat turn re-queries
 * it. IP-derived location barely moves turn to turn, so this is long — mainly here to pick up
 * a genuinely new location (different network) within a session, and to keep us well under
 * ipapi.co's free-tier rate limit. */
const LOCATION_TTL_MS = 60 * 60 * 1000;

/** Bounds the IP-lookup request so a slow/unreachable endpoint can't stall message sending. */
const LOCATION_FETCH_TIMEOUT_MS = 4000;

/** Loose match for messages that are plausibly asking about the user's own whereabouts —
 * used only to decide whether to re-offer the location popup after a prior denial. */
const LOCATION_INTENT_RE =
  /\bwhere\s+(am\s+i|are\s+we)\b|\bmy\s+(current\s+)?location\b|\bnear(by|\s+me)\b|\bwhat\s+city\s+am\s+i\b|\bcurrent\s+location\b|\bwhat.?s\s+my\s+location\b/i;

let cachedLocation: { value: string | undefined; expiresAt: number } | null = null;
let inFlight: Promise<string | undefined> | null = null;

interface IpApiResponse {
  city?: string;
  region?: string;
  country_name?: string;
  error?: boolean;
}

/** Looks up the caller's own approximate location from their IP via ipapi.co — no browser
 * geolocation prompt, just a city-level estimate. Never sends anything more precise than
 * city/region/country. */
async function fetchIpLocation(): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOCATION_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    if (!res.ok) return undefined;
    const data = (await res.json()) as IpApiResponse;
    if (data.error) return undefined;
    const parts = [data.city, data.region, data.country_name].filter(Boolean);
    if (parts.length === 0) return undefined;
    return `${parts.join(", ")} (approximate, via IP)`;
  } catch {
    return undefined; // network error, timeout, or blocked request — just omit location this turn
  } finally {
    clearTimeout(timeout);
  }
}

async function getLocation(): Promise<string | undefined> {
  const now = Date.now();
  if (cachedLocation && cachedLocation.expiresAt > now) return cachedLocation.value;
  if (!inFlight) {
    inFlight = fetchIpLocation().finally(() => {
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
 * sensitive. Location is IP-derived (see fetchIpLocation) and only ever looked up once the
 * user has granted consent through the in-site popup (components/LocationConsentPrompt.tsx)
 * or the Settings toggle — never via the browser's own geolocation prompt.
 *
 * When consent is "unset", this triggers the popup once and sends no location this turn. When
 * consent is "denied", it re-triggers the popup only if `lastUserMessage` looks like the user
 * is asking about their own whereabouts (see LOCATION_INTENT_RE) — so declining doesn't get
 * asked again on every message, only when it'd actually help.
 */
export async function getClientContext(
  locationConsent: ScribbleSettings["locationConsent"],
  lastUserMessage?: string,
  customSystemPrompt?: string,
  memories?: string[]
): Promise<ClientContext> {
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

  let location: string | undefined;
  if (locationConsent === "granted") {
    location = await getLocation();
  } else if (locationConsent === "unset") {
    useLocationPrompt.getState().request();
  } else if (locationConsent === "denied" && lastUserMessage && LOCATION_INTENT_RE.test(lastUserMessage)) {
    useLocationPrompt.getState().request();
  }

  return {
    localTime,
    timezone,
    location,
    ...(customSystemPrompt ? { customSystemPrompt } : {}),
    ...(memories && memories.length > 0 ? { memories } : {}),
  };
}
