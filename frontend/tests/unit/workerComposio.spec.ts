import { test, expect } from "@playwright/test";
import {
  authConfigsFor,
  composioCallbackUrl,
  composioUserId,
  createConnectLink,
  disconnectAccount,
  isToolkitSlug,
  parseConnections,
} from "../../../worker/src/composio";
import {
  issueConfirmationToken,
  runMcpTool,
  stableStringify,
  verifyConfirmationToken,
  type McpToolDescriptor,
  type McpToolProvider,
} from "../../../worker/src/mcpTools";
import { handleMcpAccountApi, isMcpAccountPath } from "../../../worker/src/mcpRoutes";

type Env = Parameters<typeof composioCallbackUrl>[1];
const env = {
  ALLOWED_ORIGINS: "http://localhost:5173,https://lofin.dev,http://evil.example",
  COMPOSIO_API_KEY: "test-composio-key",
  FIREBASE_PROJECT_ID: "demo-project",
  COMPOSIO_AUTH_CONFIG_GITHUB: "ac_github_1",
  COMPOSIO_AUTH_CONFIG_SLACK: "not valid!",
} as unknown as Env;

const withOrigin = (origin: string | null) =>
  new Request("https://worker.test/api/mcp/composio/connect", { method: "POST", headers: origin ? { Origin: origin } : {} });

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

/** Replaces global fetch with a scripted Composio and records every outbound call. */
async function withComposio<T>(replies: Array<{ status?: number; body: unknown }>, fn: (calls: Call[]) => Promise<T>): Promise<T> {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

test.describe("Composio toolkits and identity", () => {
  test("only the safe toolkit allowlist is accepted", () => {
    for (const slug of ["gmail", "github", "slack", "notion", "googlecalendar"]) expect(isToolkitSlug(slug)).toBe(true);
    for (const slug of ["", "GMAIL", "gmail/../x", "toString", "__proto__", "stripe", 5, null]) expect(isToolkitSlug(slug)).toBe(false);
  });

  test("users are namespaced and auth configs come only from valid secrets", () => {
    expect(composioUserId("abc123")).toBe("lofin:abc123");
    expect(authConfigsFor(env)).toEqual({ github: "ac_github_1" });
  });
});

test.describe("callback URL validation", () => {
  test("uses the request origin only when it is on the Lofin allowlist", () => {
    expect(composioCallbackUrl(withOrigin("https://lofin.dev"), env)).toBe("https://lofin.dev/mcp");
    expect(composioCallbackUrl(withOrigin("http://localhost:5173"), env)).toBe("http://localhost:5173/mcp");
    expect(composioCallbackUrl(withOrigin("https://attacker.example"), env)).toBeNull();
    expect(composioCallbackUrl(withOrigin(null), env)).toBeNull();
  });

  test("plain http is refused for non-loopback hosts even if allowlisted", () => {
    expect(composioCallbackUrl(withOrigin("http://evil.example"), env)).toBeNull();
  });
});

test.describe("connection status", () => {
  test("maps Composio states and ignores other users and unknown toolkits", () => {
    const rows = parseConnections(
      {
        items: [
          { id: "ca_1", status: "ACTIVE", toolkit: { slug: "gmail" }, user_id: "lofin:u1", created_at: "2026-01-02T00:00:00Z" },
          { id: "ca_2", status: "INITIATED", toolkit: { slug: "github" }, user_id: "lofin:u1", created_at: "2026-01-03T00:00:00Z" },
          { id: "ca_3", status: "FAILED", toolkit: { slug: "slack" }, user_id: "lofin:u1", created_at: "2026-01-03T00:00:00Z" },
          { id: "ca_4", status: "ACTIVE", toolkit: { slug: "gmail" }, user_id: "lofin:someone-else" },
          { id: "ca_5", status: "ACTIVE", toolkit: { slug: "stripe" }, user_id: "lofin:u1" },
          { id: "../bad", status: "ACTIVE", toolkit: { slug: "gmail" }, user_id: "lofin:u1" },
        ],
      },
      "lofin:u1"
    );
    expect(rows.map((r) => r.status).sort()).toEqual(["connected", "failed", "pending"]);
    expect(rows.map((r) => r.id).sort()).toEqual(["ca_1", "ca_2", "ca_3"]);
  });

  test("drops an old failure once a newer account is connected", () => {
    const rows = parseConnections(
      [
        { id: "ca_old", status: "FAILED", toolkit: { slug: "gmail" }, created_at: "2026-01-01T00:00:00Z" },
        { id: "ca_new", status: "ACTIVE", toolkit: { slug: "gmail" }, created_at: "2026-01-02T00:00:00Z" },
      ],
      "lofin:u1"
    );
    expect(rows.map((r) => r.id)).toEqual(["ca_new"]);
  });
});

test.describe("Connect Link", () => {
  test("creates a namespaced session and returns only the redirect and account id", async () => {
    const { result, calls } = await withComposio(
      [
        { body: { session_id: "trs_a1" } },
        { status: 201, body: { link_token: "SECRET-LINK-TOKEN", redirect_url: "https://connect.composio.dev/link/lk_1", connected_account_id: "ca_9" } },
      ],
      async (calls) => ({ result: await createConnectLink(env, "uid-link-1", "github", "https://lofin.dev/mcp"), calls })
    );
    expect(result).toEqual({ ok: true, value: { redirectUrl: "https://connect.composio.dev/link/lk_1", connectedAccountId: "ca_9" } });
    expect(JSON.stringify(result)).not.toContain("SECRET-LINK-TOKEN");
    expect(calls[0]).toMatchObject({ url: "https://backend.composio.dev/api/v3.1/tool_router/session", method: "POST" });
    expect(calls[0].body).toMatchObject({ user_id: "lofin:uid-link-1", auth_configs: { github: "ac_github_1" } });
    expect(calls[1].body).toEqual({ toolkit: "github", callback_url: "https://lofin.dev/mcp" });
    for (const call of calls) {
      expect(call.url.startsWith("https://backend.composio.dev/")).toBe(true);
      expect(call.headers["x-api-key"]).toBe("test-composio-key");
    }
  });

  test("reuses the cached session for the same user", async () => {
    const link = { status: 201, body: { redirect_url: "https://connect.composio.dev/link/x", connected_account_id: "ca_1" } };
    const calls = await withComposio([{ body: { session_id: "trs_b1" } }, link, link], async (calls) => {
      await createConnectLink(env, "uid-reuse", "gmail", "https://lofin.dev/mcp");
      await createConnectLink(env, "uid-reuse", "slack", "https://lofin.dev/mcp");
      return calls;
    });
    expect(calls.filter((c) => c.url.endsWith("/tool_router/session"))).toHaveLength(1);
  });

  test("rejects a redirect that is not Composio-hosted", async () => {
    const result = await withComposio(
      [
        { body: { session_id: "trs_c1" } },
        { status: 201, body: { redirect_url: "https://evil.example/phish", connected_account_id: "ca_1" } },
      ],
      () => createConnectLink(env, "uid-evil", "gmail", "https://lofin.dev/mcp")
    );
    expect(result.ok).toBe(false);
  });

  test("does not forward Composio error text to the caller", async () => {
    const result = await withComposio([{ status: 400, body: { error: { message: "leaky detail" } } }], () =>
      createConnectLink(env, "uid-err", "gmail", "https://lofin.dev/mcp")
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("leaky");
  });
});

test.describe("disconnect", () => {
  test("refuses accounts that do not belong to the user and never calls DELETE", async () => {
    const { result, calls } = await withComposio(
      [{ body: { items: [{ id: "ca_mine", status: "ACTIVE", toolkit: { slug: "gmail" }, user_id: "lofin:u9" }] } }],
      async (calls) => ({ result: await disconnectAccount(env, "u9", "ca_theirs"), calls })
    );
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(calls[0].url).toContain("user_ids=lofin%3Au9");
  });

  test("deletes an owned account", async () => {
    const { result, calls } = await withComposio(
      [
        { body: { items: [{ id: "ca_mine", status: "ACTIVE", toolkit: { slug: "gmail" }, user_id: "lofin:u9" }] } },
        { body: { success: true } },
      ],
      async (calls) => ({ result: await disconnectAccount(env, "u9", "ca_mine"), calls })
    );
    expect(result.ok).toBe(true);
    expect(calls[1]).toMatchObject({ method: "DELETE", url: "https://backend.composio.dev/api/v3.1/connected_accounts/ca_mine" });
  });
});

test.describe("HTTP routes", () => {
  const json = (body: unknown, status: number, headers: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
  const call = (path: string, init: RequestInit = {}) => {
    const request = new Request(`https://worker.test${path}`, init);
    return handleMcpAccountApi(request, env, new URL(request.url), {}, json);
  };

  test("recognises only Composio and tool paths", () => {
    expect(isMcpAccountPath("/api/mcp/composio/connect")).toBe(true);
    expect(isMcpAccountPath("/api/mcp/tools/execute")).toBe(true);
    expect(isMcpAccountPath("/api/mcp/inspect")).toBe(false);
  });

  test("every endpoint requires a Firebase token", async () => {
    const routes: Array<[string, string]> = [
      ["/api/mcp/composio/connections", "GET"],
      ["/api/mcp/composio/connect", "POST"],
      ["/api/mcp/composio/connections/ca_1", "DELETE"],
      ["/api/mcp/tools", "GET"],
      ["/api/mcp/tools/execute", "POST"],
    ];
    for (const [path, method] of routes) {
      const response = await call(path, { method, body: method === "POST" ? "{}" : undefined });
      expect(response.status, path).toBe(401);
    }
  });

  test("a malformed token is rejected without reaching Composio", async () => {
    const { response, calls } = await withComposio([], async (calls) => ({
      response: await call("/api/mcp/composio/connections", { headers: { Authorization: "Bearer a.b.c" } }),
      calls,
    }));
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

test.describe("tool confirmation", () => {
  const read: McpToolDescriptor = { id: "GMAIL_FETCH_EMAILS", name: "Fetch emails", toolkit: "gmail", readOnly: true };
  const send: McpToolDescriptor = { id: "GMAIL_SEND_EMAIL", name: "Send email", toolkit: "gmail", readOnly: false };
  function fakeProvider() {
    const executed: string[] = [];
    const provider: McpToolProvider = {
      id: "fake",
      listTools: async (_uid, options) => ({ ok: true, value: [read, send].filter((t) => !options?.toolkits || options.toolkits.includes(t.toolkit)) }),
      executeTool: async (_uid, tool) => {
        executed.push(tool.id);
        return { ok: true, value: { ran: tool.id } };
      },
    };
    return { provider, executed };
  }

  test("stable stringify ignores key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe(stableStringify({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
  });

  test("tokens bind user, tool, arguments, and expiry", async () => {
    const args = { to: "a@example.com" };
    const token = await issueConfirmationToken("k", "u1", "T", args, 1_000_000);
    expect(await verifyConfirmationToken("k", token, "u1", "T", args, 1_000_000)).toBe(true);
    expect(await verifyConfirmationToken("k", token, "u2", "T", args, 1_000_000)).toBe(false);
    expect(await verifyConfirmationToken("k", token, "u1", "OTHER", args, 1_000_000)).toBe(false);
    expect(await verifyConfirmationToken("k", token, "u1", "T", { to: "b@example.com" }, 1_000_000)).toBe(false);
    expect(await verifyConfirmationToken("other-key", token, "u1", "T", args, 1_000_000)).toBe(false);
    expect(await verifyConfirmationToken("k", token, "u1", "T", args, 1_000_000 + 301_000)).toBe(false);
    expect(await verifyConfirmationToken("k", "garbage", "u1", "T", args)).toBe(false);
  });

  test("read-only tools run immediately", async () => {
    const { provider, executed } = fakeProvider();
    const outcome = await runMcpTool(provider, "k", "u1", { tool: read.id, arguments: {} }, ["gmail"]);
    expect(outcome).toEqual({ status: "executed", result: { ran: read.id } });
    expect(executed).toEqual([read.id]);
  });

  test("side-effecting tools need a token for those exact arguments", async () => {
    const { provider, executed } = fakeProvider();
    const args = { to: "a@example.com", body: "hi" };
    const first = await runMcpTool(provider, "k", "u1", { tool: send.id, arguments: args }, ["gmail"]);
    expect(first.status).toBe("confirmation_required");
    expect(executed).toEqual([]);
    const token = (first as { confirmationToken: string }).confirmationToken;

    const tampered = await runMcpTool(provider, "k", "u1", { tool: send.id, arguments: { ...args, to: "evil@example.com" }, confirmationToken: token }, ["gmail"]);
    expect(tampered.status).toBe("confirmation_required");
    expect(executed).toEqual([]);

    const approved = await runMcpTool(provider, "k", "u1", { tool: send.id, arguments: { body: "hi", to: "a@example.com" }, confirmationToken: token }, ["gmail"]);
    expect(approved.status).toBe("executed");
    expect(executed).toEqual([send.id]);
  });

  test("unknown tools and toolkits without an active connection are refused", async () => {
    const { provider, executed } = fakeProvider();
    expect(await runMcpTool(provider, "k", "u1", { tool: "NOPE", arguments: {} }, ["gmail"])).toMatchObject({ status: "error", httpStatus: 404 });
    expect(await runMcpTool(provider, "k", "u1", { tool: read.id, arguments: {} }, ["github"])).toMatchObject({ status: "error", httpStatus: 404 });
    expect(await runMcpTool(provider, "k", "u1", { tool: "bad slug!", arguments: {} }, ["gmail"])).toMatchObject({ status: "error", httpStatus: 400 });
    expect(executed).toEqual([]);
  });
});
