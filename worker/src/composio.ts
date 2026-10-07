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
  { slug: "gmail", name: "Gmail", group: "Email and calendar" },
  { slug: "outlook", name: "Outlook", group: "Email and calendar" },
  { slug: "googlecalendar", name: "Google Calendar", group: "Email and calendar" },
  { slug: "calendly", name: "Calendly", group: "Email and calendar" },
  { slug: "googledrive", name: "Google Drive", group: "Files and documents" },
  { slug: "googlesheets", name: "Google Sheets", group: "Files and documents" },
  { slug: "googledocs", name: "Google Docs", group: "Files and documents" },
  { slug: "dropbox", name: "Dropbox", group: "Files and documents" },
  { slug: "notion", name: "Notion", group: "Files and documents" },
  { slug: "airtable", name: "Airtable", group: "Files and documents" },
  { slug: "slack", name: "Slack", group: "Team chat" },
  { slug: "discord", name: "Discord", group: "Team chat" },
  { slug: "microsoft_teams", name: "Microsoft Teams", group: "Team chat" },
  { slug: "github", name: "GitHub", group: "Code and design" },
  { slug: "gitlab", name: "GitLab", group: "Code and design" },
  { slug: "figma", name: "Figma", group: "Code and design" },
  { slug: "canva", name: "Canva", group: "Code and design" },
  { slug: "linear", name: "Linear", group: "Projects and CRM" },
  { slug: "jira", name: "Jira", group: "Projects and CRM" },
  { slug: "asana", name: "Asana", group: "Projects and CRM" },
  { slug: "clickup", name: "ClickUp", group: "Projects and CRM" },
  { slug: "monday", name: "Monday", group: "Projects and CRM" },
  { slug: "hubspot", name: "HubSpot", group: "Projects and CRM" },
  { slug: "mailchimp", name: "Mailchimp", group: "Projects and CRM" },
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

/** Optional Composio auth config id (a Worker secret) for a toolkit's custom OAuth app:
 * COMPOSIO_AUTH_CONFIG_<SLUG>, e.g. COMPOSIO_AUTH_CONFIG_GOOGLEDRIVE. Unset means Composio-managed auth. */
export function authConfigSecretName(slug: ToolkitSlug): string {
  return `COMPOSIO_AUTH_CONFIG_${slug.toUpperCase().replace(/-/g, "_")}`;
}

export function authConfigsFor(env: Env): Record<string, string> {
  const secrets = env as unknown as Record<string, string | undefined>;
  const configs: Record<string, string> = {};
  for (const toolkit of COMPOSIO_TOOLKITS) {
    const id = secrets[authConfigSecretName(toolkit.slug)]?.trim();
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
  return { ok: true, value: true };
}

// ── Tools (consumed through the McpToolProvider abstraction) ────────────────────────

const TOOL_CACHE_TTL_MS = 30 * 60_000;
const TOOL_PAGE_LIMIT = 100;
const TOOL_MAX_PAGES = 10;
/** Per-toolkit descriptors without schemas, so the cache stays small. */
const toolCache = new Map<string, { tools: McpToolDescriptor[]; expiresAt: number }>();

function parseTool(item: Record<string, unknown>, includeSchemas: boolean): McpToolDescriptor | null {
  const rawToolkit = typeof item.toolkit === "string" ? item.toolkit : (item.toolkit as { slug?: unknown } | undefined)?.slug;
  const toolkit = typeof rawToolkit === "string" ? rawToolkit.toLowerCase() : undefined;
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

/**
 * A toolkit's tool catalog. A session's own /tools listing only exposes Composio's meta tools
 * (search, execute helpers), so real tools are listed per toolkit instead. The catalog does not
 * depend on the user; which toolkits a user may use is decided by their connected accounts.
 */
async function fetchToolkitTools(env: Env, toolkit: ToolkitSlug, includeSchemas: boolean): Promise<McpResult<McpToolDescriptor[]>> {
  const tools: McpToolDescriptor[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < TOOL_MAX_PAGES; page++) {
    const query = `toolkit_slug=${toolkit}&limit=${TOOL_PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const result = await composioFetch<{ items?: unknown; next_cursor?: unknown } | Array<Record<string, unknown>>>(env, `/tools?${query}`);
    if (!result.ok) return result;
    const rawItems = Array.isArray(result.value) ? result.value : result.value.items;
    const items = Array.isArray(rawItems) ? (rawItems as Array<Record<string, unknown>>) : [];
    for (const item of items) {
      const tool = item && typeof item === "object" ? parseTool(item, includeSchemas) : null;
      if (tool && tool.toolkit === toolkit) tools.push(tool);
    }
    const next = Array.isArray(result.value) ? undefined : result.value.next_cursor;
    cursor = typeof next === "string" && next ? next : undefined;
    if (!cursor) break;
  }
  return { ok: true, value: tools };
}

async function catalogFor(env: Env, slug: ToolkitSlug, includeSchemas: boolean): Promise<McpResult<McpToolDescriptor[]>> {
  const cached = toolCache.get(slug);
  if (!includeSchemas && cached && cached.expiresAt > Date.now()) return { ok: true, value: cached.tools };
  const fetched = await fetchToolkitTools(env, slug, includeSchemas);
  // Never cache an empty listing: it usually means a transient or not-yet-ready state.
  if (fetched.ok && !includeSchemas && fetched.value.length > 0) remember(toolCache, slug, { tools: fetched.value, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
  return fetched;
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "please", "can", "you", "saying", "say", "tell", "about", "me", "my", "to", "of", "an", "a", "in", "on"]);

/** Everyday verbs mapped to the verbs tool ids use, so "make a repo" prefers CREATE_A_REPOSITORY. */
const VERB_ALIASES: Record<string, string[]> = {
  make: ["create"], new: ["create"], build: ["create"], start: ["create"], write: ["create"], compose: ["create", "send"], draft: ["create"],
  add: ["create", "add"], open: ["create", "open"], post: ["create", "post", "send"], send: ["send"], email: ["send"], message: ["send", "post"],
  create: ["create"], delete: ["delete"], remove: ["delete", "remove"], update: ["update"], edit: ["update", "edit"], rename: ["update", "rename"],
  close: ["close"], merge: ["merge"], share: ["share"], upload: ["upload", "create"], schedule: ["create", "schedule"], book: ["create"],
  read: ["get", "list", "fetch"], show: ["get", "list"], find: ["search", "find", "list"], search: ["search", "find"], list: ["list"], check: ["get", "list", "fetch"],
};

/** Ranks catalog tools against a request by word overlap with their id, name, and description,
 * with a strong boost for the action the user asked for (create, send, delete, …). */
export function rankTools(useCase: string, tools: readonly McpToolDescriptor[], limit: number): McpToolDescriptor[] {
  const words = [...new Set(useCase.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))];
  if (words.length === 0) return [];
  const verbs = new Set(words.flatMap((word) => VERB_ALIASES[word] ?? []));
  return tools
    .map((tool) => {
      const idWords = tool.id.toLowerCase().split("_");
      const id = idWords.join(" ");
      const text = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
      // Words in the tool id and name count most: GMAIL_SEND_EMAIL for "send an email".
      let score = words.reduce((sum, word) => sum + (id.includes(word) ? 3 : 0) + (text.includes(word) ? 1 : 0), 0);
      // The action verb sits right after the toolkit prefix in a tool id (GITHUB_CREATE_..., GMAIL_SEND_...).
      if (verbs.size > 0 && idWords.slice(1, 3).some((word) => verbs.has(word))) score += 8;
      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tool);
}

export function createComposioProvider(env: Env): McpToolProvider {
  return {
    id: "composio",
    async listTools(_uid, options) {
      const includeSchemas = options?.includeSchemas === true;
      const slugs = (options?.toolkits ?? COMPOSIO_TOOLKITS.map((toolkit) => toolkit.slug)).filter(isToolkitSlug);
      const lists = await Promise.all(
        slugs.map((slug) => catalogFor(env, slug, includeSchemas))
      );
      const failed = lists.find((list) => !list.ok);
      if (failed && !failed.ok) return failed;
      return { ok: true, value: lists.flatMap((list) => (list.ok ? list.value : [])) };
    },
    async searchTools(uid, useCase, toolkits) {
      const wanted = new Set(toolkits);
      const searched = await withSession(env, uid, (sessionId) =>
        composioFetch<{ results?: Array<{ primary_tool_slugs?: unknown; related_tool_slugs?: unknown; tool_schemas?: unknown }> }>(env, `/tool_router/session/${sessionId}/search`, {
          method: "POST",
          body: { queries: [{ use_case: useCase.slice(0, 1000) }] },
        })
      );
      const result = searched.ok ? searched.value.results?.[0] : undefined;
      // Response shape only (counts and field names), to diagnose empty searches.
      console.warn("composio search", JSON.stringify({
        ok: searched.ok,
        resultKeys: result ? Object.keys(result) : [],
        primary: Array.isArray(result?.primary_tool_slugs) ? result.primary_tool_slugs.length : null,
        schemas: result?.tool_schemas && typeof result.tool_schemas === "object" ? Object.keys(result.tool_schemas).length : null,
      }));
      const schemas = result?.tool_schemas && typeof result.tool_schemas === "object" ? (result.tool_schemas as Record<string, Record<string, unknown>>) : {};
      const slugs = [...(Array.isArray(result?.primary_tool_slugs) ? result.primary_tool_slugs : []), ...(Array.isArray(result?.related_tool_slugs) ? result.related_tool_slugs : [])]
        .filter((slug): slug is string => typeof slug === "string");
      const tools: McpToolDescriptor[] = [];
      for (const slug of [...new Set(slugs)]) {
        const raw = schemas[slug];
        if (!raw || typeof raw !== "object") continue;
        // Search results describe a tool's toolkit and arguments slightly differently from the
        // tool listing, so accept either shape and fall back to the slug's prefix.
        const toolkit = typeof raw.toolkit === "string" ? raw.toolkit : (raw.toolkit as { slug?: unknown } | undefined)?.slug ?? slug.split("_")[0].toLowerCase();
        const params = raw.input_parameters ?? raw.inputSchema ?? raw.input_schema ?? raw.parameters;
        const parsed = parseTool({ ...raw, slug, toolkit: { slug: String(toolkit).toLowerCase() }, input_parameters: params }, true);
        if (parsed && wanted.has(parsed.toolkit)) tools.push(parsed);
        if (tools.length >= 8) break;
      }
      if (tools.length > 0) return { ok: true, value: tools };

      // Search found nothing usable: rank the toolkits' own catalogs against the request instead,
      // then fetch full argument schemas for just the best few.
      const catalogs = await Promise.all([...wanted].filter(isToolkitSlug).map((slug) => catalogFor(env, slug, false)));
      const ranked = rankTools(useCase, catalogs.flatMap((catalog) => (catalog.ok ? catalog.value : [])), 12);
      const detailed = await Promise.all(
        ranked.map(async (tool) => {
          const detail = await composioFetch<Record<string, unknown>>(env, `/tools/${encodeURIComponent(tool.id)}`);
          return (detail.ok && parseTool(detail.value, true)) || tool;
        })
      );
      return { ok: true, value: detailed };
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
