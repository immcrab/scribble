import type { McpServerConfig } from "./storage";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";

export interface McpToolSummary {
  name: string;
  description?: string;
}

export interface McpInspection {
  reachable: boolean;
  authRequired?: boolean;
  serverName?: string;
  toolCount?: number;
  tools?: McpToolSummary[];
  message?: string;
}

/** The Worker performs inspection so the browser never directly probes arbitrary endpoints. */
export async function inspectMcpServer(
  workerUrl: string,
  password: string | undefined,
  server: Pick<McpServerConfig, "url">
): Promise<McpInspection> {
  if (!workerUrl.trim()) throw new Error("Set a Cloudflare Worker URL before testing an MCP server.");
  const response = await fetch(`${workerUrl.replace(/\/$/, "")}/api/mcp/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(password ? { "X-Lofin-Password": password } : {}) },
    body: JSON.stringify({ url: server.url }),
  });
  const payload = (await response.json().catch(() => null)) as (McpInspection & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error || "The Worker could not inspect this MCP server.");
  return payload ?? { reachable: false, message: "The MCP server returned an unreadable response." };
}
// ── Composio OAuth connections ─────────────────────────────────────────────────────
// The Worker owns every credential. The browser only ever sees toolkit names, opaque
// connected-account ids, a connection state, and a Composio-hosted redirect URL.

export type ComposioConnectionState = "connected" | "pending" | "failed";

export interface ComposioToolkit {
  slug: string;
  name: string;
}

export interface ComposioConnection {
  id: string;
  toolkit: string;
  status: ComposioConnectionState;
  createdAt?: string;
}

export interface ComposioOverview {
  configured: boolean;
  toolkits: ComposioToolkit[];
  connections: ComposioConnection[];
}

export interface ComposioToolSummary extends McpToolSummary {
  id: string;
  toolkit: string;
  readOnly: boolean;
}

async function composioRequest<T>(path: string, init: { method?: string; body?: unknown; okStatuses?: number[] } = {}): Promise<T> {
  const { workerUrl, password } = useChatStore.getState().settings;
  if (!workerUrl.trim()) throw new Error("Set a Cloudflare Worker URL before connecting accounts.");
  const user = useAuthStore.getState().user;
  if (!user) throw new Error("Sign in to connect accounts.");
  const response = await fetch(`${workerUrl.replace(/\/$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(password ? { "X-Lofin-Password": password } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!(response.ok || init.okStatuses?.includes(response.status)) || !payload) throw new Error(payload?.error || `The Worker could not complete this request (${response.status}).`);
  return payload;
}

export const fetchComposioOverview = () => composioRequest<ComposioOverview>("/api/mcp/composio/connections");

export async function startComposioConnect(toolkit: string): Promise<string> {
  const { redirectUrl } = await composioRequest<{ redirectUrl: string }>("/api/mcp/composio/connect", { method: "POST", body: { toolkit } });
  const url = new URL(redirectUrl);
  if (url.protocol !== "https:" || (url.hostname !== "composio.dev" && !url.hostname.endsWith(".composio.dev"))) {
    throw new Error("The Worker returned an unexpected connect link.");
  }
  return url.toString();
}

export const disconnectComposioAccount = (id: string) =>
  composioRequest<{ ok: true }>(`/api/mcp/composio/connections/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function fetchComposioTools(toolkit: string): Promise<ComposioToolSummary[]> {
  return (await composioRequest<{ tools: ComposioToolSummary[] }>(`/api/mcp/tools?toolkits=${encodeURIComponent(toolkit)}`)).tools;
}

export type ComposioExecuteOutcome =
  | { status: "executed"; result: unknown }
  | { status: "confirmation_required"; confirmationToken: string };

/** Runs a prepared Agent tool call after the user pressed Approve. The Worker re-checks the
 * approval token against these exact arguments; a stale token yields a fresh one instead. */
export function executeComposioTool(tool: string, args: Record<string, unknown>, confirmationToken: string): Promise<ComposioExecuteOutcome> {
  return composioRequest<ComposioExecuteOutcome>("/api/mcp/tools/execute", { method: "POST", body: { tool, arguments: args, confirmationToken }, okStatuses: [409] });
}
