import type { Env } from "./types";

export function resolveOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = resolveOrigin(request, env);
  return {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    // Announcement uploads authenticate with a Firebase bearer token. If this header
    // is absent the browser rejects the request during preflight as “Failed to fetch”,
    // before the Worker can return a useful error.
    "Access-Control-Allow-Headers": "Content-Type, X-Scribble-Password, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
