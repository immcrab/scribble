/**
 * Provider-neutral abstraction over remote MCP tools, used by Agent Mode only.
 *
 * Nothing here is reachable from Direct, Battle, Side by Side, Image, or Speech modes:
 * those modes never call the /api/mcp/tools* routes. Credentials (API keys, session
 * MCP headers, OAuth tokens) stay inside a provider implementation such as composio.ts
 * and never appear in these types.
 */

export type McpResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

export interface McpToolDescriptor {
  /** Provider tool id, e.g. Composio's GMAIL_FETCH_EMAILS. */
  id: string;
  name: string;
  description?: string;
  /** Toolkit / app slug the tool belongs to, e.g. "gmail". */
  toolkit: string;
  /** True only when the provider explicitly marks the tool read-only. Anything else is
   * treated as having external side effects and needs user confirmation. */
  readOnly: boolean;
  /** JSON Schema of the arguments. Only populated when schemas are requested (model use). */
  inputSchema?: Record<string, unknown>;
}

export interface McpToolProvider {
  readonly id: string;
  listTools(userId: string, options?: { toolkits?: readonly string[]; includeSchemas?: boolean }): Promise<McpResult<McpToolDescriptor[]>>;
  executeTool(userId: string, tool: McpToolDescriptor, args: Record<string, unknown>): Promise<McpResult<unknown>>;
}

export const CONFIRMATION_TTL_SECONDS = 300;
const MAX_ARGUMENT_CHARS = 50_000;
const MAX_RESULT_CHARS = 100_000;

export function requiresConfirmation(tool: McpToolDescriptor): boolean {
  return !tool.readOnly;
}

/** Deterministic JSON so a confirmation is bound to exactly the arguments the user saw. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** HMAC key derived (one-way) from a Worker secret, so the raw secret is never used directly. */
async function confirmationKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lofin-mcp-confirm-v1:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function confirmationPayload(userId: string, toolId: string, args: Record<string, unknown>, expiresAt: number): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableStringify(args)));
  return new TextEncoder().encode(`${userId}\n${toolId}\n${toBase64Url(new Uint8Array(digest))}\n${expiresAt}`);
}

/** Stateless confirmation token bound to user, tool, exact arguments, and an expiry. */
export async function issueConfirmationToken(secret: string, userId: string, toolId: string, args: Record<string, unknown>, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + CONFIRMATION_TTL_SECONDS;
  const signature = await crypto.subtle.sign("HMAC", await confirmationKey(secret), await confirmationPayload(userId, toolId, args, expiresAt));
  return `${expiresAt}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyConfirmationToken(secret: string, token: unknown, userId: string, toolId: string, args: Record<string, unknown>, now = Date.now()): Promise<boolean> {
  if (typeof token !== "string" || token.length > 200) return false;
  const [expiry, signature, extra] = token.split(".");
  if (extra !== undefined || !/^\d{1,12}$/.test(expiry ?? "") || !signature) return false;
  const expiresAt = Number(expiry);
  if (expiresAt < Math.floor(now / 1000)) return false;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return false;
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", await confirmationKey(secret), signatureBytes, await confirmationPayload(userId, toolId, args, expiresAt));
}

export type McpRunOutcome =
  | { status: "confirmation_required"; confirmationToken: string; expiresInSeconds: number; tool: Pick<McpToolDescriptor, "id" | "name" | "description" | "toolkit">; arguments: Record<string, unknown> }
  | { status: "executed"; result: unknown }
  | { status: "error"; httpStatus: number; message: string };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundResult(data: unknown): unknown {
  const text = JSON.stringify(data) ?? "null";
  return text.length <= MAX_RESULT_CHARS ? data : { truncated: true, preview: text.slice(0, MAX_RESULT_CHARS) };
}

/**
 * Executes a tool the provider itself listed for this user. Tools with possible external
 * side effects (anything not explicitly read-only) first return a confirmation request; they
 * run only when called again with the token issued for exactly that tool and those arguments.
 * Side-effect classification comes from the provider, never from the caller.
 */
export async function runMcpTool(
  provider: McpToolProvider,
  confirmationSecret: string,
  userId: string,
  request: { tool: unknown; arguments: unknown; confirmationToken?: unknown },
  allowedToolkits: readonly string[]
): Promise<McpRunOutcome> {
  if (typeof request.tool !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(request.tool)) {
    return { status: "error", httpStatus: 400, message: "Provide a valid tool id." };
  }
  const args = request.arguments === undefined ? {} : request.arguments;
  if (!isPlainObject(args) || stableStringify(args).length > MAX_ARGUMENT_CHARS) {
    return { status: "error", httpStatus: 400, message: "Tool arguments must be a JSON object under 50 KB." };
  }

  const listed = await provider.listTools(userId, { toolkits: allowedToolkits });
  if (!listed.ok) return { status: "error", httpStatus: listed.status, message: listed.message };
  const tool = listed.value.find((candidate) => candidate.id === request.tool);
  if (!tool) return { status: "error", httpStatus: 404, message: "That tool is not available for your connected accounts." };

  if (requiresConfirmation(tool) && !(await verifyConfirmationToken(confirmationSecret, request.confirmationToken, userId, tool.id, args))) {
    return {
      status: "confirmation_required",
      confirmationToken: await issueConfirmationToken(confirmationSecret, userId, tool.id, args),
      expiresInSeconds: CONFIRMATION_TTL_SECONDS,
      tool: { id: tool.id, name: tool.name, description: tool.description, toolkit: tool.toolkit },
      arguments: args,
    };
  }

  const executed = await provider.executeTool(userId, tool, args);
  if (!executed.ok) return { status: "error", httpStatus: executed.status, message: executed.message };
  return { status: "executed", result: boundResult(executed.value) };
}

/*
 * ── INTEGRATION BOUNDARY (Agent Mode model tool-calling) ─────────────────────────────
 * Everything above is provider-agnostic and finished. Letting a chat model call these
 * tools automatically needs provider-specific tool-call plumbing in the Agent loop that
 * is intentionally NOT wired yet. When it is, the loop should:
 *   1. call getAgentToolDefinitions() once per Agent turn and pass the result to the model;
 *   2. route each model tool call through runMcpTool();
 *   3. on "confirmation_required", surface the tool name and arguments to the user and
 *      only re-invoke runMcpTool() with the returned token after an explicit approval.
 * Do not call these from Direct, Battle, Side by Side, Image, or Speech handlers.
 */
export async function getAgentToolDefinitions(provider: McpToolProvider, userId: string, toolkits: readonly string[]): Promise<McpResult<McpToolDescriptor[]>> {
  return provider.listTools(userId, { toolkits, includeSchemas: true });
}
