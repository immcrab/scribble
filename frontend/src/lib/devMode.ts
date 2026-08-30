/**
 * Local-development escape hatch.
 *
 * When the app is opened from a localhost origin we treat it as a developer's
 * own machine and drop the two honour-system gates that only make sense for the
 * public deployment:
 *
 *   - sign-in gating on non-default models (config/models.ts `isModelGated`)
 *   - the daily credit / usage limit (lib/usage.ts `usageGate` / `mediaUsageGate`)
 *
 * Everything still works signed-in too — this only removes the *requirement*.
 * It has no effect on the real deployment, whose hostname is never localhost.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function isLocalDev(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}
