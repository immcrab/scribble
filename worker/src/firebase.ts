/**
 * Workers-compatible Firebase Auth admin access.
 *
 * The `firebase-admin` npm package pulls in Node core modules (crypto, http2,
 * fs, process) that the Workers runtime doesn't provide, so instead we talk to
 * Google's Identity Toolkit REST API directly:
 *
 *   1. Sign a short-lived JWT with the service account's RSA private key using
 *      the WebCrypto API (crypto.subtle) — available on Workers.
 *   2. Exchange that JWT for an OAuth2 access token at oauth2.googleapis.com.
 *   3. Call accounts:sendOobCode with returnOobLink=true to get the same
 *      verification link `admin.auth().generateEmailVerificationLink()` returns.
 *
 * Nothing here imports a Node builtin; it runs as-is on the Workers runtime.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode";
const SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

/** Cached access token, reused across requests handled by the same warm isolate.
 * Isolates are ephemeral, so this is best-effort — a cold isolate just re-mints. */
let tokenCache: { token: string; expiresAt: number } | null = null;

function base64UrlFromString(s: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(s));
}

function base64UrlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCS#8 PEM -> ArrayBuffer of the DER body. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not set.");
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email / private_key / project_id.");
  }
  // `wrangler secret put` from a shell often turns real newlines into "\n" —
  // normalise so importKey can parse the PEM either way.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

async function mintAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) return tokenCache.token;

  const header = base64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlFromString(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: sa.token_uri || GOOGLE_TOKEN_URI,
      scope: SCOPE,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlFromBytes(sigBuf)}`;

  const res = await fetch(sa.token_uri || GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description || res.status}`);
  }

  tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

export interface VerificationLinkOptions {
  continueUrl?: string;
}

/**
 * Equivalent of admin.auth().generateEmailVerificationLink(email).
 * The user must already exist in Firebase Auth — otherwise Identity Toolkit
 * returns EMAIL_NOT_FOUND, surfaced here as an Error with that message.
 */
export async function generateEmailVerificationLink(
  sa: ServiceAccount,
  email: string,
  opts: VerificationLinkOptions = {}
): Promise<string> {
  const token = await mintAccessToken(sa);

  const body: Record<string, unknown> = {
    requestType: "VERIFY_EMAIL",
    email,
    returnOobLink: true,
  };
  if (opts.continueUrl) {
    body.continueUrl = opts.continueUrl;
    body.canHandleCodeInApp = false;
  }

  const res = await fetch(IDENTITY_TOOLKIT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { oobLink?: string; error?: { message?: string } };
  if (!res.ok || !data.oobLink) {
    throw new Error(`sendOobCode failed: ${data.error?.message || res.status}`);
  }
  return data.oobLink;
}
