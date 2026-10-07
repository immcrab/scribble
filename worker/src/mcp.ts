import type { Env } from "./types";

type JsonResponse = (body: unknown, status: number, headers: HeadersInit) => Response;
type McpPayload = { result?: { serverInfo?: { name?: unknown }; tools?: Array<{ name?: unknown; description?: unknown }> }; error?: { message?: unknown } };
const MAX_RESPONSE_BYTES = 1_000_000;
const MCP_PROTOCOL_VERSION = "2025-03-26";

function privateIpv4(host: string): boolean {
  const pieces = host.split(".");
  if (pieces.length !== 4 || !pieces.every((part) => /^\d{1,3}$/.test(part))) return false;
  const [a, b, ...rest] = pieces.map(Number);
  if ([a, b, ...rest].some((part) => part > 255)) return true;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function parsePublicHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !host || host === "localhost" || host.endsWith(".localhost") || host.includes(":") ||
      privateIpv4(host) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

async function mcpCall(url: URL, body: unknown, sessionId?: string): Promise<Response> {
  return fetch(url, {
    method: "POST", redirect: "manual",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function mcpJson(response: Response): Promise<McpPayload | null> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) return null;
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) return null;
  const value = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split(/\r?\n/).filter((line) => line.startsWith("data:")).at(-1)?.slice(5).trim()
    : text;
  if (!value) return null;
  try { return JSON.parse(value) as McpPayload; } catch { return null; }
}

/** A deliberately narrow endpoint: it performs initialize and tools/list only,
 * never forwards arbitrary requests or browser-provided credentials. */
export async function handleMcpInspect(request: Request, _env: Env, cors: HeadersInit, json: JsonResponse): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = parsePublicHttpsUrl(body?.url);
  if (!url) return json({ error: "Use a public HTTPS MCP endpoint. Private-network, credentialed, and non-HTTPS URLs are blocked." }, 400, cors);

  let initialized: Response;
  try {
    initialized = await mcpCall(url, {
      jsonrpc: "2.0", id: "lofin-initialize", method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Lofin", version: "1.0" } },
    });
  } catch { return json({ reachable: false, message: "The Worker could not reach this MCP endpoint." }, 200, cors); }

  if (initialized.status === 401 || initialized.status === 403) {
    return json({ reachable: true, authRequired: true, message: "The server is reachable and requires authentication." }, 200, cors);
  }
  if (!initialized.ok) return json({ reachable: false, message: `The MCP endpoint returned HTTP ${initialized.status}.` }, 200, cors);

  const init = await mcpJson(initialized);
  if (init?.error?.message) return json({ reachable: false, message: String(init.error.message) }, 200, cors);
  const serverName = typeof init?.result?.serverInfo?.name === "string" ? init.result.serverInfo.name : undefined;
  const sessionId = initialized.headers.get("mcp-session-id") ?? initialized.headers.get("Mcp-Session-Id") ?? undefined;
  try { await mcpCall(url, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId); } catch { /* optional protocol notification */ }

  let toolsResponse: Response;
  try { toolsResponse = await mcpCall(url, { jsonrpc: "2.0", id: "lofin-tools", method: "tools/list", params: {} }, sessionId); }
  catch { return json({ reachable: true, serverName, message: "Connected, but the server did not answer tools/list." }, 200, cors); }
  if (toolsResponse.status === 401 || toolsResponse.status === 403) {
    return json({ reachable: true, authRequired: true, serverName, message: "The server requires authentication before its tools can be listed." }, 200, cors);
  }
  if (!toolsResponse.ok) return json({ reachable: true, serverName, message: `Connected, but tools/list returned HTTP ${toolsResponse.status}.` }, 200, cors);

  const result = await mcpJson(toolsResponse);
  const allTools = Array.isArray(result?.result?.tools) ? result.result.tools : [];
  const tools = allTools.filter((tool): tool is { name: string; description?: unknown } => typeof tool.name === "string" && tool.name.length > 0)
    .slice(0, 30).map((tool) => ({ name: tool.name, ...(typeof tool.description === "string" ? { description: tool.description.slice(0, 180) } : {}) }));
  return json({ reachable: true, serverName, toolCount: allTools.length, tools, message: Array.isArray(result?.result?.tools) ? undefined : "Connected, but the server did not return a tools list." }, 200, cors);
}