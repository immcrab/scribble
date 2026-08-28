import type { User } from "firebase/auth";

/**
 * The single account allowed to edit the shared model catalog from `/admin`.
 * This is a client-side gate for the UI only — the real enforcement is the RTDB
 * security rule on `catalog/v1` (see README / lib/catalogSync.ts), which must
 * pin `.write` to this same address.
 */
export const ADMIN_EMAIL = "imcrabfr@gmail.com";

/** True when the signed-in user is the catalog admin and has a verified address. */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return user.email.toLowerCase() === ADMIN_EMAIL && user.emailVerified;
}
