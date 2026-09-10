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
    "Access-Control-Allow-Headers": "Content-Type, X-Scribble-Password",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
