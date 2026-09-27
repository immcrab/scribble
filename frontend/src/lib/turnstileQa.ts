/**
 * Staging-only Turnstile QA mode.
 *
 * Testers on a staging host can append `?turnstile_qa=pass|block|interactive` to swap the
 * real site key for one of Cloudflare's documented *test* site keys, which deterministically
 * pass, fail, or force an interactive challenge. The choice sticks for the tab
 * (sessionStorage) and `?turnstile_qa=off` clears it.
 *
 * Safety: QA mode is resolved purely from the page's hostname. It can never activate on a
 * production host, whatever is in the URL or storage — PRODUCTION_HOSTS is checked first
 * and wins. A host must also be explicitly listed as staging (built-in list or the
 * VITE_TURNSTILE_QA_HOSTS build variable). The test keys only produce dummy tokens, which
 * the production Worker rejects; only a Worker deployed with TURNSTILE_QA_MODE (never set
 * on production — see worker/src/turnstile.ts) accepts them.
 *
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */

export const PRODUCTION_SITE_KEY = "0x4AAAAAAFDwyUYIy39o_-gg";

export const PRODUCTION_HOSTS: readonly string[] = ["lofin.dev", "www.lofin.dev", "ai.lofin.dev"];

/** Hosts where QA mode may be switched on. Anything else — including unknown hosts — can't. */
export const DEFAULT_STAGING_HOSTS: readonly string[] = ["staging.lofin.dev", "localhost", "127.0.0.1"];

export const QA_SITE_KEYS = {
  pass: "1x00000000000000000000AA",
  block: "2x00000000000000000000AB",
  interactive: "3x00000000000000000000FF",
} as const;

export type TurnstileQaMode = keyof typeof QA_SITE_KEYS;

export const QA_PARAM = "turnstile_qa";
const QA_STORAGE_KEY = "lofin:turnstile-qa";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

export function isProductionHost(hostname: string): boolean {
  const h = normalizeHost(hostname);
  return PRODUCTION_HOSTS.includes(h) || (h.endsWith(".lofin.dev") && !stagingSubdomain(h));
}

/** `*.staging.lofin.dev` preview hosts count as staging; every other lofin.dev subdomain is production. */
function stagingSubdomain(h: string): boolean {
  return h === "staging.lofin.dev" || h.endsWith(".staging.lofin.dev");
}

export function isStagingHost(hostname: string, extraHosts: readonly string[] = []): boolean {
  const h = normalizeHost(hostname);
  if (isProductionHost(h)) return false;
  if (stagingSubdomain(h)) return true;
  return [...DEFAULT_STAGING_HOSTS, ...extraHosts.map(normalizeHost)].includes(h);
}

function parseMode(raw: string | null | undefined): TurnstileQaMode | "off" | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "off") return "off";
  return v in QA_SITE_KEYS ? (v as TurnstileQaMode) : null;
}

export interface TurnstileConfig {
  siteKey: string;
  qaMode: TurnstileQaMode | null;
}

/**
 * Pure resolver — every input is passed in, so it's unit-testable without a browser.
 * Returns the production key unless the host is a (non-production) staging host AND a
 * valid QA mode was requested via the URL or remembered for this tab.
 */
export function resolveTurnstileConfig(input: {
  hostname: string;
  search: string;
  storedMode?: string | null;
  extraStagingHosts?: readonly string[];
}): TurnstileConfig & { persist: TurnstileQaMode | "off" | null } {
  const prod: TurnstileConfig & { persist: null } = { siteKey: PRODUCTION_SITE_KEY, qaMode: null, persist: null };
  if (isProductionHost(input.hostname)) return prod;
  if (!isStagingHost(input.hostname, input.extraStagingHosts)) return prod;

  const fromUrl = parseMode(new URLSearchParams(input.search).get(QA_PARAM));
  if (fromUrl === "off") return { ...prod, persist: "off" };
  const mode = fromUrl ?? parseMode(input.storedMode);
  if (!mode || mode === "off") return prod;
  return { siteKey: QA_SITE_KEYS[mode], qaMode: mode, persist: fromUrl };
}

function extraHostsFromEnv(): string[] {
  const raw = (import.meta.env.VITE_TURNSTILE_QA_HOSTS as string | undefined) ?? "";
  return raw.split(",").map((h) => h.trim()).filter(Boolean);
}

/** Browser entry point: reads location + sessionStorage and remembers an explicit URL choice. */
export function currentTurnstileConfig(): TurnstileConfig {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(QA_STORAGE_KEY);
  } catch {
    // storage blocked — URL param still works for this load
  }
  const cfg = resolveTurnstileConfig({
    hostname: window.location.hostname,
    search: window.location.search,
    storedMode: stored,
    extraStagingHosts: extraHostsFromEnv(),
  });
  try {
    if (cfg.persist === "off") sessionStorage.removeItem(QA_STORAGE_KEY);
    else if (cfg.persist) sessionStorage.setItem(QA_STORAGE_KEY, cfg.persist);
  } catch {
    // ignore
  }
  return { siteKey: cfg.siteKey, qaMode: cfg.qaMode };
}
