import type { McpServerConfig } from "./storage";

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