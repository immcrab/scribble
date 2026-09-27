import type { Env } from "./types";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ALLOWED_ACTIONS = new Set(["site_gate", "sign_in"]);

/**
 * Staging-only QA mode. A staging deployment sets TURNSTILE_QA_MODE ("pass" | "fail") so the
 * frontend's Cloudflare *test* site keys (frontend/src/lib/turnstileQa.ts) can get through
 * the gate: their dummy tokens are verified against Cloudflare's matching public *test*
 * secret instead of the real one.
 *
 * It can't switch on in production: QA needs the env var AND a request whose own host is
 * not a production host. Both the Worker's routes and the check below are host-based, so a
 * production deployment ignores the variable even if it were ever set by mistake, and the
 * dummy token never reaches a real secret (which would reject it anyway).
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const PRODUCTION_HOSTS = new Set(["lofin.dev", "www.lofin.dev", "ai.lofin.dev"]);
export const QA_TEST_SECRETS = {
  pass: "1x0000000000000000000000000000000AA",
  fail: "2x0000000000000000000000000000000AA",
} as const;
export const QA_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export function isProductionHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (PRODUCTION_HOSTS.has(h)) return true;
  // Any other lofin.dev subdomain is production too, except the staging tree.
  return h.endsWith(".lofin.dev") && h !== "staging.lofin.dev" && !h.endsWith(".staging.lofin.dev");
}

/** The QA secret to use for this request, or null when QA mode must not apply. */
export function turnstileQaSecret(env: Pick<Env, "TURNSTILE_QA_MODE">, requestUrl: string): string | null {
  const mode = env.TURNSTILE_QA_MODE?.trim().toLowerCase();
  if (mode !== "pass" && mode !== "fail") return null;
  let host: string;
  try {
    host = new URL(requestUrl).hostname;
  } catch {
    return null;
  }
  if (isProductionHost(host)) return null;
  return QA_TEST_SECRETS[mode];
}

/** Verifies a single-use Turnstile token issued to the site-gate widget. */
export async function verifyTurnstileToken(token: unknown, request: Request, env: Env): Promise<boolean> {
  const qaSecret = turnstileQaSecret(env, request.url);
  if (qaSecret) return verifyQaToken(token, qaSecret);
  const expectedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    !env.TURNSTILE_SECRET ||
    expectedHostnames.size === 0
  ) {
    return false;
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") ?? "",
      }),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean; action?: string; hostname?: string };
    return (
      result.success === true &&
      typeof result.action === "string" &&
      ALLOWED_ACTIONS.has(result.action) &&
      typeof result.hostname === "string" &&
      expectedHostnames.has(result.hostname)
    );
  } catch {
    return false;
  }
}

/** QA path: only the documented dummy token, only against a public test secret. */
async function verifyQaToken(token: unknown, secret: string): Promise<boolean> {
  if (token !== QA_DUMMY_TOKEN) return false;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
