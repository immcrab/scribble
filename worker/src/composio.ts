import type { Env } from "./types";
import { resolveOrigin } from "./cors";
import type { McpResult, McpToolDescriptor, McpToolProvider } from "./mcpTools";

/**
 * Composio integration using the current Sessions API (v3.1): a per-user session,
 * Composio-hosted Connect Links for OAuth, and session tool execution. The deprecated
 * per-server MCP URL APIs are not used.
 *
 * Everything sensitive stays in this Worker: the project API key, OAuth tokens, and
 * connected-account credentials are never returned to the browser or logged. Error text
 * from Composio is also not forwarded, because it can echo request details.
 */

export const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3.1";

export const COMPOSIO_TOOLKITS = [
  { slug: "gmail", name: "Gmail" },
  { slug: "github", name: "GitHub" },
  { slug: "slack", name: "Slack" },
  { slug: "notion", name: "Notion" },
  { slug: "googlecalendar", name: "Google Calendar" },
] as const;

export type ToolkitSlug = (typeof COMPOSIO_TOOLKITS)[number]["slug"];

const TOOLKIT_SLUGS: ReadonlySet<string> = new Set(COMPOSIO_TOOLKITS.map((toolkit) => toolkit.slug));

export function isToolkitSlug(value: unknown): value is ToolkitSlug {
  return typeof value === "string" && TOOLKIT_SLUGS.has(value);
}

/** Stable Composio identity for a Lofin user. The uid is a verified Firebase claim. */
export function composioUserId(uid: string): string {
  return `lofin:${uid}`;
}

export function isSafeUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

/** Optional Composio auth config ids, kept as Worker secrets rather than frontend config. */
const AUTH_CONFIG_SECRETS: Record<ToolkitSlug, "COMPOSIO_AUTH_CONFIG_GMAIL" | "COMPOSIO_AUTH_CONFIG_GITHUB" | "COMPOSIO_AUTH_CONFIG_SLACK" | "COMPOSIO_AUTH_CONFIG_NOTION" | "COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR"> = {
  gmail: "COMPOSIO_AUTH_CONFIG_GMAIL",
  github: "COMPOSIO_AUTH_CONFIG_GITHUB",
  slack: "COMPOSIO_AUTH_CONFIG_SLACK",
  notion: "COMPOSIO_AUTH_CONFIG_NOTION",
  googlecalendar: "COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR",
};

export function authConfigsFor(env: Env): Record<string, string> {
  const configs: Record<string, string> = {};
  for (const toolkit of COMPOSIO_TOOLKITS) {
    const id = env[AUTH_CONFIG_SECRETS[toolkit.slug]]?.trim();
    if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id)) configs[toolkit.slug] = id;
  }
  return configs;
}

/**
 * Where Composio sends the user after OAuth. It is built from the request Origin only when
 * that origin is on Lofin's own CORS allowlist, so a caller cannot pick an arbitrary return
 * host. HTTPS is required; plain http is accepted solely for loopback development hosts.
 */
export function composioCallbackUrl(request: Request, env: Env): string | null {
  const origin = resolveOrigin(request, env);
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
  return `${parsed.origin}/mcp`;
}

/** The configured key with pasted whitespace/newlines and an accidental `NAME=` prefix removed,
 * either of which would make the x-api-key header invalid. Null when unset. */
export function composioApiKey(env: Env): string | null {
  const key = env.COMPOSIO_API_KEY?.replace(/\s+/g, "").replace(/^COMPOSIO_API_KEY=/i, "");
  return key ? key : null;
}

async function composioFetch<T>(env: Env, path: string, init: { method?: string; body?: unknown } = {}): Promise<McpResult<T>> {
  const apiKey = composioApiKey(env);
  if (!apiKey) return { ok: false, status: 503, message: "Composio is not configured on this Worker." };
  let response: Response;
  try {
    response = await fetch(`${COMPOSIO_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Workers only accept "follow" | "manual"; never follow redirects with the API key attached.
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    // Only the error class is logged: messages and headers could contain credentials.
    console.warn("composio request failed", err instanceof Error ? err.name : "unknown");
    return { ok: false, status: 502, message: "The Worker could not reach Composio." };
  }
  if (response.status >= 300 && response.status < 400) return { ok: false, status: 502, message: "Composio returned an unexpected redirect." };
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403 ? "Composio rejected the Worker's credentials." :
      response.status === 404 ? "Composio could not find that resource." :
      response.status === 429 ? "Composio is rate limiting requests. Try again shortly." :
      "Composio rejected the request.";
    return { ok: false, status: response.status === 404 || response.status === 429 ? response.status : 502, message };
  }
  try {
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false, status: 502, message: "Composio returned an unreadable response." };
  }
}

// ── Sessions ────────────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 25 * 60_000;
const MAX_CACHED = 500;
/** Session ids only (not secrets). Per-isolate best-effort reuse; a miss just creates one. */
const sessionCache = new Map<string, { id: string; expiresAt: number }>();

function remember<V>(cache: Map<string, V>, key: string, value: V): void {
  if (cache.size >= MAX_CACHED && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

async function ensureSession(env: Env, uid: string, forceNew = false): Promise<McpResult<string>> {
  const cached = sessionCache.get(uid);
  if (!forceNew && cached && cached.expiresAt > Date.now()) return { ok: true, value: cached.id };
  const authConfigs = authConfigsFor(env);
  const created = await composioFetch<{ session_id?: unknown }>(env, "/tool_router/session", {
    method: "POST",
    body: {
      user_id: composioUserId(uid),
      toolkits: { enable: COMPOSIO_TOOLKITS.map((toolkit) => toolkit.slug) },
      ...(Object.keys(authConfigs).length ? { auth_configs: authConfigs } : {}),
    },
  });
  if (!created.ok) return created;
  const id = created.value.session_id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return { ok: false, status: 502, message: "Composio returned an unexpected session." };
  remember(sessionCache, uid, { id, expiresAt: Date.now() + SESSION_TTL_MS });
  return { ok: true, value: id };
}

/** Runs a session call, recreating the session once if Composio no longer knows it. */
async function withSession<T>(env: Env, uid: string, call: (sessionId: string) => Promise<McpResult<T>>): Promise<McpResult<T>> {
  const session = await ensureSession(env, uid);
  if (!session.ok) return session;
  const first = await call(session.value);
  if (first.ok || first.status !== 404) return first;
  sessionCache.delete(uid);
  const fresh = await ensureSession(env, uid, true);
  return fresh.ok ? call(fresh.value) : fresh;
}

// ── Connect Link ────────────────────────────────────────────────────────────────────

function isComposioHostedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (url.hostname === "composio.dev" || url.hostname.endsWith(".composio.dev"));
  } catch {
    return false;
  }
}

export interface ConnectLink {
  redirectUrl: string;
  connectedAccountId?: string;
}

/** Creates a Composio-hosted OAuth Connect Link. Only the redirect URL and account id are kept. */
export async function createConnectLink(env: Env, uid: string, toolkit: ToolkitSlug, callbackUrl: string): Promise<McpResult<ConnectLink>> {
  const link = await withSession(env, uid, (sessionId) =>
    composioFetch<{ redirect_url?: unknown; connected_account_id?: unknown }>(env, `/tool_router/session/${sessionId}/link`, {
      method: "POST",
      body: { toolkit, callback_url: callbackUrl },
    })
  );
  if (!link.ok) return link;
  if (!isComposioHostedUrl(link.value.redirect_url)) return { ok: false, status: 502, message: "Composio returned an unexpected connect link." };
  const id = link.value.connected_account_id;
  return {
    ok: true,
    value: { redirectUrl: link.value.redirect_url, ...(typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? { connectedAccountId: id } : {}) },
  };
}

// ── Connection status ───────────────────────────────────────────────────────────────

export type ConnectionState = "connected" | "pending" | "failed";

export interface ConnectionSummary {
  id: string;
  toolkit: ToolkitSlug;
  status: ConnectionState;
  createdAt?: string;
}

export function normalizeConnectionState(raw: unknown): ConnectionState {
  switch (typeof raw === "string" ? raw.toUpperCase() : "") {
    case "ACTIVE": return "connected";
    case "INITIALIZING":
    case "INITIATED": return "pending";
    default: return "failed";
  }
}

/** Keeps only this user's accounts for allowed toolkits and drops superseded stale rows. */
export function parseConnections(payload: unknown, composioUser: string): ConnectionSummary[] {
  const raw = Array.isArray(payload) ? payload : (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return [];
  const all: ConnectionSummary[] = [];
  for (const item of raw as Array<Record<string, unknown> | null>) {
    if (!item || typeof item !== "object") continue;
    const toolkit = (item.toolkit as { slug?: unknown } | undefined)?.slug;
    if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || !isToolkitSlug(toolkit)) continue;
    if (typeof item.user_id === "string" && item.user_id !== composioUser) continue;
    all.push({
      id: item.id,
      toolkit,
      status: normalizeConnectionState(item.status),
      ...(typeof item.created_at === "string" ? { createdAt: item.created_at } : {}),
    });
  }
  // Show every connected account, plus the latest pending/failed attempt only when it is
  // newer than the toolkit's newest connected account (old failures are noise).
  const newestConnected = new Map<string, string>();
  for (const c of all) if (c.status === "connected") newestConnected.set(c.toolkit, [newestConnected.get(c.toolkit) ?? "", c.createdAt ?? ""].sort().at(-1) ?? "");
  const latestOther = new Map<string, ConnectionSummary>();
  for (const c of all) {
    if (c.status === "connected") continue;
    const current = latestOther.get(c.toolkit);
    if (!current || (c.createdAt ?? "") > (current.createdAt ?? "")) latestOther.set(c.toolkit, c);
  }
  const kept = all.filter((c) => c.status === "connected");
  for (const other of latestOther.values()) {
    const connectedAt = newestConnected.get(other.toolkit);
    if (connectedAt === undefined || (other.createdAt ?? "") > connectedAt) kept.push(other);
  }
  return kept.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function listConnections(env: Env, uid: string): Promise<McpResult<ConnectionSummary[]>> {
  const user = composioUserId(uid);
  const listed = await composioFetch<unknown>(env, `/connected_accounts?user_ids=${encodeURIComponent(user)}&limit=100`);
  return listed.ok ? { ok: true, value: parseConnections(listed.value, user) } : listed;
}

/** Deletes a connected account only after confirming it belongs to this user. */
export async function disconnectAccount(env: Env, uid: string, accountId: string): Promise<McpResult<true>> {
  const owned = await listConnections(env, uid);
  if (!owned.ok) return owned;
  if (!owned.value.some((connection) => connection.id === accountId)) return { ok: false, status: 404, message: "That connected account was not found." };
  const removed = await composioFetch<unknown>(env, `/connected_accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  if (!removed.ok && removed.status !== 404) return removed;
  toolCache.delete(uid);
  return { ok: true, value: true };
}

// ── Tools (consumed through the McpToolProvider abstraction) ────────────────────────

const TOOL_CACHE_TTL_MS = 5 * 60_000;
const TOOL_PAGE_LIMIT = 500;
const TOOL_MAX_PAGES = 6;
/** Descriptors without schemas, so the cache stays small. */
const toolCache = new Map<string, { tools: McpToolDescriptor[]; expiresAt: number }>();

function parseTool(item: Record<string, unknown>, includeSchemas: boolean): McpToolDescriptor | null {
  const toolkit = (item.toolkit as { slug?: unknown } | undefined)?.slug;
  const slug = typeof item.slug === "string" ? item.slug : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(slug) || !isToolkitSlug(toolkit) || item.is_deprecated === true) return null;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const schema = item.input_parameters;
  return {
    id: slug,
    name: typeof item.name === "string" ? item.name.slice(0, 120) : slug,
    ...(typeof item.description === "string" ? { description: item.description.slice(0, 400) } : {}),
    toolkit,
    readOnly: tags.includes("readOnlyHint"),
    ...(includeSchemas && schema && typeof schema === "object" ? { inputSchema: schema as Record<string, unknown> } : {}),
  };
}

async function fetchAllTools(env: Env, uid: string, includeSchemas: boolean): Promise<McpResult<McpToolDescriptor[]>> {
  return withSession(env, uid, async (sessionId) => {
    const tools: McpToolDescriptor[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < TOOL_MAX_PAGES; page++) {
      const query = `limit=${TOOL_PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const result = await composioFetch<{ items?: unknown; next_cursor?: unknown }>(env, `/tool_router/session/${sessionId}/tools?${query}`);
      if (!result.ok) return result;
      for (const item of Array.isArray(result.value.items) ? (result.value.items as Array<Record<string, unknown>>) : []) {
        const tool = item && typeof item === "object" ? parseTool(item, includeSchemas) : null;
        if (tool) tools.push(tool);
      }
      cursor = typeof result.value.next_cursor === "string" && result.value.next_cursor ? result.value.next_cursor : undefined;
      if (!cursor) break;
    }
    return { ok: true, value: tools };
  });
}

export function createComposioProvider(env: Env): McpToolProvider {
  return {
    id: "composio",
    async listTools(uid, options) {
      const includeSchemas = options?.includeSchemas === true;
      const cached = toolCache.get(uid);
      let tools: McpToolDescriptor[];
      if (!includeSchemas && cached && cached.expiresAt > Date.now()) {
        tools = cached.tools;
      } else {
        const fetched = await fetchAllTools(env, uid, includeSchemas);
        if (!fetched.ok) return fetched;
        tools = fetched.value;
        if (!includeSchemas) remember(toolCache, uid, { tools, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
      }
      const wanted = options?.toolkits ? new Set(options.toolkits) : null;
      return { ok: true, value: wanted ? tools.filter((tool) => wanted.has(tool.toolkit)) : tools };
    },
    async executeTool(uid, tool, args) {
      const executed = await withSession(env, uid, (sessionId) =>
        composioFetch<{ data?: unknown; error?: unknown }>(env, `/tool_router/session/${sessionId}/execute`, {
          method: "POST",
          body: { tool_slug: tool.id, arguments: args },
        })
      );
      if (!executed.ok) return executed;
      if (executed.value.error) return { ok: false, status: 502, message: "The tool reported an error while running." };
      return { ok: true, value: executed.value.data ?? null };
    },
  };
}
