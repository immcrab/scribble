import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, PlugZap, Search } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { useAuthStore } from "../state/authStore";
import {
  disconnectComposioAccount,
  fetchComposioOverview,
  fetchComposioTools,
  startComposioConnect,
  type ComposioConnection,
  type ComposioConnectionState,
  type ComposioOverview,
  type ComposioToolkit,
  type ComposioToolSummary,
} from "../lib/mcpClient";

const STATUS_LABEL: Record<ComposioConnectionState, string> = { connected: "Connected", pending: "Pending", failed: "Failed" };
const STATUS_CLASS: Record<ComposioConnectionState, string> = {
  connected: "border-emerald-500/40 text-emerald-300",
  pending: "border-amber-500/40 text-amber-300",
  failed: "border-red-500/40 text-red-300",
};
const MAX_PENDING_POLLS = 12;

/** Composio returns the user here with `status` and `connected_account_id` query params.
 * Only the coarse status is read; both params are removed from the address bar immediately
 * and the real state is always re-fetched from the Worker. */
function consumeReturnParams(): "success" | "failed" | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("status") && !params.has("connected_account_id")) return null;
  const status = params.get("status");
  params.delete("status");
  params.delete("connected_account_id");
  const rest = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return status === "success" ? "success" : "failed";
}

const FALLBACK_TOOLKITS: ComposioToolkit[] = [
  { slug: "gmail", name: "Gmail", group: "Email and calendar" },
  { slug: "googlecalendar", name: "Google Calendar", group: "Email and calendar" },
  { slug: "googledocs", name: "Google Docs", group: "Files and documents" },
  { slug: "googleslides", name: "Google Slides", group: "Files and documents" },
  { slug: "notion", name: "Notion", group: "Files and documents" },
  { slug: "slack", name: "Slack", group: "Team chat" },
  { slug: "github", name: "GitHub", group: "Code and design" },
];

/** Composio's logo for a toolkit, falling back to a letter tile if it can't load. */
function ToolkitIcon({ toolkit, size = 18 }: { toolkit: ComposioToolkit; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded bg-base-700 text-[10px] font-semibold text-slate-300">
        {toolkit.name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={`https://logos.composio.dev/api/${encodeURIComponent(toolkit.slug)}`} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded" />;
}

/** Toolkit chooser styled like the model chooser: search box, grouped rows, check on the pick. */
function ToolkitPicker({ toolkits, value, onChange, connected, disabled }: { toolkits: ComposioToolkit[]; value: string; onChange: (slug: string) => void; connected: ReadonlySet<string>; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const current = toolkits.find((toolkit) => toolkit.slug === value) ?? toolkits[0];
  const needle = query.trim().toLowerCase();
  const matching = toolkits.filter((toolkit) => !needle || toolkit.name.toLowerCase().includes(needle) || toolkit.slug.includes(needle));
  const groups = [...new Set(matching.map((toolkit) => toolkit.group ?? "More"))].map((group) => ({ group, items: matching.filter((toolkit) => (toolkit.group ?? "More") === group) }));

  return (
    <Dropdown
      label="Choose an app to connect"
      mobileSheet
      menuClassName="max-h-[28rem] w-[20rem] max-w-[calc(100vw-1rem)]"
      trigger={({ open, toggle, menuId }) => (
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`App: ${current?.name ?? "none selected"}`}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent-500/50 hover:bg-base-700/60 disabled:opacity-50 sm:min-h-0"
        >
          {current && <ToolkitIcon toolkit={current} size={15} />}
          <span className="max-w-[160px] truncate">{current ? current.name : "Select app"}</span>
          <ChevronDown size={13} aria-hidden="true" className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="sticky top-0 z-10 border-b border-base-700/60 bg-base-850 p-2">
            <label className="relative block">
              <span className="sr-only">Search apps</span>
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                data-autofocus=""
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps…"
                className="w-full rounded-md border border-base-600/60 bg-base-900/60 py-2 pl-8 pr-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none sm:py-1.5"
              />
            </label>
          </div>
          {groups.map(({ group, items }) => (
            <div key={group} role="group" aria-label={group} className="border-b border-base-700/40 py-1 last:border-b-0">
              <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-2" role="presentation">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</span>
                <span className="text-[11px] text-slate-600">{items.length}</span>
              </div>
              {items.map((toolkit) => {
                const active = toolkit.slug === current?.slug;
                return (
                  <button
                    key={toolkit.slug}
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => { onChange(toolkit.slug); setQuery(""); close(); }}
                    className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 sm:min-h-9 ${active ? "bg-accent-500/10 font-medium text-white" : "text-slate-300"}`}
                  >
                    <ToolkitIcon toolkit={toolkit} />
                    <span className="min-w-0 flex-1 truncate">{toolkit.name}</span>
                    {connected.has(toolkit.slug) && <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-400">Connected</span>}
                    {active ? <Check size={13} className="shrink-0 text-accent-400" aria-label="Selected" /> : <span className="w-[13px] shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
          {matching.length === 0 && <p className="px-3.5 py-3 text-xs text-slate-500" role="status">No apps match "{query.trim()}".</p>}
        </>
      )}
    </Dropdown>
  );
}

export function ComposioConnections() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const [overview, setOverview] = useState<ComposioOverview | null>(null);
  const [toolkit, setToolkit] = useState("gmail");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const outcome = consumeReturnParams();
    if (outcome === null) return null;
    return outcome === "success" ? "Returned from Composio. Checking your connection…" : "Composio did not complete the connection. See the status below.";
  });
  const [tools, setTools] = useState<Record<string, ComposioToolSummary[] | "loading" | { error: string }>>({});
  const polls = useRef(0);
  const uid = user?.uid;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchComposioOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!uid) { setOverview(null); return; }
    void refresh();
  }, [uid, refresh]);

  // Authorization can finish a moment after the redirect; poll briefly while pending.
  const hasPending = overview?.connections.some((connection) => connection.status === "pending") ?? false;
  useEffect(() => {
    if (!hasPending) { polls.current = 0; return; }
    if (polls.current >= MAX_PENDING_POLLS) return;
    const timer = window.setTimeout(() => { polls.current += 1; void refresh(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [hasPending, overview, refresh]);

  const connect = async () => {
    setBusy("connect");
    setError(null);
    try {
      // Same-tab navigation: no popup blocker, and the Settings route restores on return.
      window.location.assign(await startComposioConnect(toolkit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connection.");
      setBusy(null);
    }
  };

  const disconnect = async (connection: ComposioConnection, label: string) => {
    if (!window.confirm(`Disconnect this ${label} account from Lofin?`)) return;
    setBusy(connection.id);
    setError(null);
    try {
      await disconnectComposioAccount(connection.id);
      setTools((current) => { const { [connection.toolkit]: _removed, ...rest } = current; return rest; });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect this account.");
    } finally {
      setBusy(null);
    }
  };

  const showTools = async (slug: string) => {
    setTools((current) => ({ ...current, [slug]: "loading" }));
    try {
      const list = await fetchComposioTools(slug);
      setTools((current) => ({ ...current, [slug]: list }));
    } catch (err) {
      setTools((current) => ({ ...current, [slug]: { error: err instanceof Error ? err.message : "Could not load tools." } }));
    }
  };

  const nameOf = (slug: string) => overview?.toolkits.find((item) => item.slug === slug)?.name ?? slug;
  const inputClass = "rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500";

  return (
    <div className="rounded-2xl border border-base-600/70 bg-base-900/35 p-4">
      <div className="flex items-start gap-3">
        <PlugZap size={17} className="mt-0.5 shrink-0 text-accent-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-white">Composio</h4><span className="rounded-full border border-base-600/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">OAuth</span></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Connect your own accounts through Composio's hosted sign-in. Tokens and API keys stay on Lofin's Worker; this browser only sees connection status. In Agent mode, you can create Google Docs and Slides, draft and send email, manage projects, work with files, and more.</p>
        </div>
      </div>

      {authLoading ? (
        <p className="mt-4 text-xs text-slate-500">Checking sign-in…</p>
      ) : !user ? (
        <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-xs text-slate-400">Sign in to Lofin to connect accounts.</p><button onClick={() => void signInWithGoogle()} className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400">Sign in</button></div>
      ) : (
        <>
          {overview && !overview.configured ? (
            <p className="mt-4 text-xs text-amber-300">Composio is not configured on this Worker yet (missing COMPOSIO_API_KEY secret).</p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ToolkitPicker
                toolkits={overview?.toolkits ?? FALLBACK_TOOLKITS}
                value={toolkit}
                onChange={setToolkit}
                connected={new Set((overview?.connections ?? []).filter((connection) => connection.status === "connected").map((connection) => connection.toolkit))}
                disabled={busy !== null}
              />
              <button onClick={() => void connect()} disabled={busy !== null || !overview} className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-50">{busy === "connect" ? "Opening Composio…" : "Connect"}</button>
              <button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-base-600/60 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-base-700/60 disabled:opacity-50">{loading ? "Refreshing…" : "Refresh status"}</button>
            </div>
          )}
          {notice && <p className="mt-3 text-xs text-slate-300">{notice}</p>}
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          {overview && overview.connections.length > 0 && (
            <ul className="mt-4 space-y-2">
              {overview.connections.map((connection) => {
                const label = nameOf(connection.toolkit);
                const toolState = tools[connection.toolkit];
                return (
                  <li key={connection.id} className="rounded-xl border border-base-600/60 bg-base-900/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_CLASS[connection.status]}`}>{STATUS_LABEL[connection.status]}</span>
                      <span className="flex-1" />
                      {connection.status === "connected" && <button onClick={() => void showTools(connection.toolkit)} disabled={toolState === "loading"} className="text-xs text-slate-300 hover:text-white disabled:opacity-50">{toolState === "loading" ? "Loading tools…" : "View tools"}</button>}
                      <button onClick={() => void disconnect(connection, label)} disabled={busy !== null} className="text-xs text-slate-500 hover:text-red-300 disabled:opacity-50">{busy === connection.id ? "Disconnecting…" : "Disconnect"}</button>
                    </div>
                    {connection.status === "failed" && <p className="mt-2 text-xs text-red-300">This connection did not complete. Disconnect it and connect again.</p>}
                    {Array.isArray(toolState) && (toolState.length === 0 ? <p className="mt-2 text-xs text-slate-500">No tools discovered.</p> : <div className="mt-2 flex flex-wrap gap-1.5">{toolState.slice(0, 40).map((tool) => <span key={tool.id} title={tool.description} className="rounded-full border border-base-600/60 bg-base-850 px-2 py-1 text-[11px] text-slate-300">{tool.name}</span>)}</div>)}
                    {toolState && typeof toolState === "object" && "error" in toolState && <p className="mt-2 text-xs text-red-300">{toolState.error}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {overview?.configured && overview.connections.length === 0 && !loading && <p className="mt-4 text-xs text-slate-500">No accounts connected yet.</p>}
        </>
      )}
    </div>
  );
}
