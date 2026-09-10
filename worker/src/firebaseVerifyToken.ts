/**
 * Verify a Firebase Auth ID token on the Workers runtime, without firebase-admin.
 *
 * Firebase ID tokens are RS256 JWTs signed by Google's securetoken service.
 * We fetch Google's public keys as a JWKS (importable straight into WebCrypto
 * as "jwk" — the x509 cert endpoint is not) and verify signature + claims.
 */

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

const JWKS_URI =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** Cached JWKS, refreshed when max-age elapses (best-effort, per warm isolate). */
let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(b64url: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}

async function getKeys(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const res = await fetch(JWKS_URI);
  if (!res.ok) throw new Error(`Failed to fetch Firebase public keys (${res.status}).`);
  const body = (await res.json()) as { keys: Jwk[] };

  const cc = res.headers.get("cache-control") || "";
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
  jwksCache = { keys: body.keys, expiresAt: now + maxAge * 1000 };
  return body.keys;
}

export interface FirebaseTokenClaims {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

/**
 * Throws if the token is invalid, expired, or not issued for `projectId`.
 * Returns the uid / email / email_verified claims on success.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<FirebaseTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token.");
  const [rawHeader, rawPayload, rawSig] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = decodeJson(rawHeader) as { alg?: string; kid?: string };
  } catch {
    throw new Error("Malformed ID token.");
  }
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm.");
  if (!header.kid) throw new Error("Token has no key id.");

  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Token signed with an unknown key.");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  );
  if (!ok) throw new Error("Token signature verification failed.");

  let p: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
  };
  try {
    p = decodeJson(rawPayload) as typeof p;
  } catch {
    throw new Error("Malformed ID token.");
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (p.aud !== projectId) throw new Error("Token audience mismatch.");
  if (p.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Token issuer mismatch.");
  if (!p.sub) throw new Error("Token has no subject.");
  if (typeof p.exp !== "number" || p.exp < now - skew) throw new Error("Token has expired.");
  if (typeof p.iat !== "number" || p.iat > now + skew) throw new Error("Token issued in the future.");
  if (typeof p.auth_time === "number" && p.auth_time > now + skew) throw new Error("Token auth_time invalid.");

  return { uid: p.sub, email: p.email, emailVerified: p.email_verified === true };
}
