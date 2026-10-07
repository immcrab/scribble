import type { Env } from "./types";
import { checkPassword } from "./auth";
import { isRateLimited } from "./ratelimit";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";
import {
  COMPOSIO_TOOLKITS,
  composioCallbackUrl,
  createComposioProvider,
  createConnectLink,
  disconnectAccount,
  isSafeUid,
  isToolkitSlug,
  listConnections,
} from "./composio";
import { isPlainObject, runMcpTool } from "./mcpTools";

type JsonResponse = (body: unknown, status: number, headers: HeadersInit) => Response;

const MAX_BODY_BYTES = 64 * 1024;
const CONNECTION_PATH = /^\/api\/mcp\/composio\/connections\/([A-Za-z0-9_-]{1,64})$/;

export function isMcpAccountPath(pathname: string): boolean {
  return pathname.startsWith("/api/mcp/composio/") || pathname === "/api/mcp/tools" || pathname === "/api/mcp/tools/execute";
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Composio connection and Agent tool endpoints. Every route requires a verified Firebase ID
 * token; the uid from that token (never a client-supplied id) selects the Composio user.
 * These are fixed, validated operations, not a proxy: toolkit slugs come from an allowlist and
 * tool ids must be ones Composio itself listed for the caller's connected accounts.
 */
export async function handleMcpAccountApi(request: Request, env: Env, url: URL, cors: HeadersInit, json: JsonResponse): Promise<Response> {
  const headers = { ...cors, "Cache-Control": "no-store" };
  if (!checkPassword(request, env)) return json({ error: "Invalid or missing Lofin password." }, 401, headers);
  if (isRateLimited(`mcp-ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`)) {
    return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, headers);
  }

  if (!env.FIREBASE_PROJECT_ID) return json({ error: "Sign-in verification is not configured." }, 503, headers);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to connect accounts." }, 401, headers);
  let uid: string;
  try {
    uid = (await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID)).uid;
  } catch {
    return json({ error: "Your sign-in expired. Please sign in again." }, 401, headers);
  }
  if (!isSafeUid(uid)) return json({ error: "Your account id is not supported." }, 403, headers);
  if (isRateLimited(`mcp-uid:${uid}`)) return json({ error: "Rate limit exceeded. Slow down and try again shortly." }, 429, headers);

  const fail = (status: number, message: string) => json({ error: message }, status, headers);
  const { pathname } = url;
  const configured = Boolean(env.COMPOSIO_API_KEY);
  const toolkits = COMPOSIO_TOOLKITS.map((toolkit) => ({ ...toolkit }));

  if (pathname === "/api/mcp/composio/connections") {
    if (request.method !== "GET") return fail(405, "Method not allowed.");
    if (!configured) return json({ configured: false, toolkits, connections: [] }, 200, headers);
    const connections = await listConnections(env, uid);
    return connections.ok ? json({ configured: true, toolkits, connections: connections.value }, 200, headers) : fail(connections.status, connections.message);
  }

  const disconnectMatch = CONNECTION_PATH.exec(pathname);
  if (disconnectMatch) {
    if (request.method !== "DELETE") return fail(405, "Method not allowed.");
    if (!configured) return fail(503, "Composio is not configured on this Worker.");
    const removed = await disconnectAccount(env, uid, disconnectMatch[1]);
    return removed.ok ? json({ ok: true }, 200, headers) : fail(removed.status, removed.message);
  }

  if (pathname === "/api/mcp/composio/connect") {
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    if (!configured) return fail(503, "Composio is not configured on this Worker.");
    const body = await readJson(request);
    if (!body || !isToolkitSlug(body.toolkit)) return fail(400, "Choose a supported toolkit.");
    const callbackUrl = composioCallbackUrl(request, env);
    if (!callbackUrl) return fail(400, "This origin cannot be used as a return address.");
    const link = await createConnectLink(env, uid, body.toolkit, callbackUrl);
    return link.ok ? json({ toolkit: body.toolkit, redirectUrl: link.value.redirectUrl, connectedAccountId: link.value.connectedAccountId }, 200, headers) : fail(link.status, link.message);
  }

  if (pathname === "/api/mcp/tools" || pathname === "/api/mcp/tools/execute") {
    if (!configured) return fail(503, "Composio is not configured on this Worker.");
    const provider = createComposioProvider(env);
    const connections = await listConnections(env, uid);
    if (!connections.ok) return fail(connections.status, connections.message);
    // Only toolkits with an active connected account are usable.
    const active = [...new Set(connections.value.filter((connection) => connection.status === "connected").map((connection) => connection.toolkit))];

    if (pathname === "/api/mcp/tools") {
      if (request.method !== "GET") return fail(405, "Method not allowed.");
      const requested = url.searchParams.get("toolkits")?.split(",").map((slug) => slug.trim()).filter(Boolean);
      if (requested?.some((slug) => !isToolkitSlug(slug))) return fail(400, "Choose supported toolkits.");
      const wanted = active.filter((slug) => !requested || requested.includes(slug));
      if (wanted.length === 0) return json({ tools: [] }, 200, headers);
      const listed = await provider.listTools(uid, { toolkits: wanted });
      if (!listed.ok) return fail(listed.status, listed.message);
      const tools = listed.value.slice(0, 200).map((tool) => ({ id: tool.id, name: tool.name, description: tool.description, toolkit: tool.toolkit, readOnly: tool.readOnly }));
      return json({ tools, total: listed.value.length }, 200, headers);
    }

    // POST /api/mcp/tools/execute — Agent Mode only. See the integration boundary in mcpTools.ts.
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body) return fail(400, "Send a JSON body with a tool and arguments.");
    const outcome = await runMcpTool(provider, env.COMPOSIO_API_KEY as string, uid, body as { tool: unknown; arguments: unknown; confirmationToken?: unknown }, active);
    if (outcome.status === "error") return fail(outcome.httpStatus, outcome.message);
    // 409 tells the client an explicit user confirmation is required before this runs.
    return json(outcome, outcome.status === "confirmation_required" ? 409 : 200, headers);
  }

  return fail(404, "Not found.");
}
