import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { Activity, ArrowLeft, Cpu, MessageSquare, Sigma, Zap } from "lucide-react";
import { getRtdb } from "../lib/firebase";
import { monthKey } from "../lib/modelStats";
import { formatCount, lastDays, rankModels, type Counter, type SiteStats } from "../lib/statusSummary";
import { useCatalogStore } from "../lib/catalogSync";
import { getAllModels, PROVIDER_LABELS } from "../config/models";
import { modelSlug } from "../lib/modelSlug";
import { ModelFavicon } from "../components/ProviderIcon";
import { LogoMark } from "../components/Logo";
import type { ModelDef } from "../types";

const MODE_LABELS: Record<string, string> = {
  direct: "Direct",
  battle: "Battle",
  agent: "Agent",
  "side-by-side": "Side by Side",
  image: "Image",
  speech: "Text to Speech",
};

type Connection = "connecting" | "live" | "offline";
type Range = "all" | "month";

/** Subscribes to the public counters. Resolves to `null` data until the first snapshot lands,
 * so the page can tell "still loading" from "nothing recorded yet" (an empty object). */
function useLiveStats(month: string) {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [monthly, setMonthly] = useState<Record<string, number> | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    const db = getRtdb();
    if (!db) {
      setConnection("offline");
      return;
    }
    const unsubs = [
      onValue(
        ref(db, "stats"),
        (snap) => {
          setStats((snap.val() as SiteStats | null) ?? {});
          setUpdatedAt(Date.now());
        },
        () => setConnection("offline")
      ),
      onValue(
        ref(db, `modelStats/${month}`),
        (snap) => setMonthly((snap.val() as Record<string, number> | null) ?? {}),
        () => setMonthly({})
      ),
      onValue(ref(db, ".info/connected"), (snap) => setConnection(snap.val() === true ? "live" : "connecting")),
    ];
    return () => unsubs.forEach((off) => off());
  }, [month]);

  return { stats, monthly, connection, updatedAt };
}

/** Eases a displayed number toward its target so live increments visibly tick up. */
function useTween(target: number): number {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (shown === target) return;
    const reduce = document.documentElement.classList.contains("motion-reduce-force")
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const from = shown;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setShown(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return shown;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  loading: boolean;
}) {
  const shown = useTween(value);
  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white sm:text-3xl" title={loading ? undefined : shown.toLocaleString("en-US")}>
        {loading ? "—" : formatCount(shown)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function BarList({ rows, empty }: { rows: { key: string; label: string; value: number; hint?: string }[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-6 text-center text-sm text-slate-500">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-slate-200">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {formatCount(r.value)}
              {r.hint && <span className="ml-1.5">{r.hint}</span>}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-base-700/60">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ days }: { days: ReturnType<typeof lastDays> }) {
  const max = Math.max(...days.map((d) => d.replies), 1);
  const total = days.reduce((n, d) => n + d.replies, 0);
  if (total === 0) {
    return <p className="rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-6 text-center text-sm text-slate-500">No activity recorded in this window yet.</p>;
  }
  return (
    <div>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`Replies per day over the last ${days.length} days`}>
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-accent-500/80 transition-colors group-hover:bg-accent-400"
              style={{ height: `${Math.max(d.replies > 0 ? 4 : 1, (d.replies / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-base-600/60 bg-base-900 px-2 py-1 text-[11px] text-slate-200 group-hover:block">
              {new Date(`${d.day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
              {" · "}
              {d.replies.toLocaleString("en-US")} replies
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
        <span>{new Date(`${days[0].day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function ModelRow({ row, range }: { row: ReturnType<typeof rankModels<ModelDef>>[number]; range: Range }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={`w-6 shrink-0 text-center text-sm font-semibold tabular-nums ${row.rank <= 3 ? "text-accent-400" : "text-slate-500"}`}>
        {row.rank}
      </span>
      <ModelFavicon model={row.model} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-white">{row.model.displayName}</p>
          <p className="shrink-0 text-sm tabular-nums text-slate-200">{formatCount(row.replies)}</p>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-700/60">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(2, row.relative * 100)}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{(row.share * 100).toFixed(row.share < 0.1 ? 1 : 0)}%</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {PROVIDER_LABELS[row.model.provider] ?? row.model.provider}
          {range === "all" && row.tokens > 0 && <> · {formatCount(row.tokens)} tokens</>}
        </p>
      </div>
    </li>
  );
}

export function StatusPage({ onExit }: { onExit: () => void }) {
  const month = monthKey();
  const { stats, monthly, connection, updatedAt } = useLiveStats(month);
  const catalog = useCatalogStore((s) => s.catalog);
  const [range, setRange] = useState<Range>("all");
  const [showAll, setShowAll] = useState(false);

  const models = useMemo(() => getAllModels(), [catalog]);
  const bySlug = useMemo(() => new Map(models.map((m) => [modelSlug(m.modelId), m])), [models]);

  const loading = stats === null;
  const totals: Counter = stats?.totals ?? {};
  const days14 = useMemo(() => lastDays(stats?.daily, 14), [stats]);
  const today = days14[days14.length - 1];

  const ranked = useMemo(
    () => rankModels<ModelDef>(range === "all" ? stats?.models : monthly, bySlug),
    [range, stats, monthly, bySlug]
  );
  const visible = showAll ? ranked : ranked.slice(0, 10);

  const modeRows = useMemo(
    () =>
      Object.entries(stats?.modes ?? {})
        .map(([key, c]) => ({ key, label: MODE_LABELS[key] ?? key, value: c?.replies ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [stats]
  );

  const providerRows = useMemo(() => {
    const byProvider = new Map<string, number>();
    for (const r of rankModels<ModelDef>(stats?.models, bySlug)) {
      const label = PROVIDER_LABELS[r.model.provider] ?? r.model.provider;
      byProvider.set(label, (byProvider.get(label) ?? 0) + r.replies);
    }
    return [...byProvider.entries()].map(([label, value]) => ({ key: label, label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [stats, bySlug]);

  const monthLabel = new Date(`${month}-02T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const avgTokens = totals.replies ? Math.round((totals.tokens ?? 0) / totals.replies) : 0;

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
          title="Back to Lofin"
        >
          <ArrowLeft size={17} />
        </button>
        <LogoMark size={28} />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-white">Status</h1>
          <p className="truncate text-xs text-slate-500">Live usage across Lofin · anonymous counters only</p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            connection === "live"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : connection === "offline"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-base-600/60 bg-base-800/60 text-slate-400"
          }`}
          title={updatedAt ? `Last update ${new Date(updatedAt).toLocaleTimeString()}` : undefined}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connection === "live" ? "animate-pulse bg-emerald-400" : connection === "offline" ? "bg-red-400" : "bg-slate-500"
            }`}
          />
          {connection === "live" ? "Live" : connection === "offline" ? "Offline" : "Connecting"}
        </span>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {connection === "offline" && stats === null && (
          <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
            Couldn't reach the live database, so there's nothing to show right now. Try again in a moment.
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<MessageSquare size={13} />}
            label="Chats saved"
            value={totals.chats ?? 0}
            sub={`${formatCount(today.chats)} today · all time`}
            loading={loading}
          />
          <StatCard
            icon={<Sigma size={13} />}
            label="Tokens"
            value={totals.tokens ?? 0}
            sub={`${formatCount(today.tokens)} today · est.`}
            loading={loading}
          />
          <StatCard
            icon={<Zap size={13} />}
            label="Replies"
            value={totals.replies ?? 0}
            sub={avgTokens ? `${formatCount(today.replies)} today · ~${formatCount(avgTokens)} tok each` : `${formatCount(today.replies)} today`}
            loading={loading}
          />
          <StatCard
            icon={<Cpu size={13} />}
            label="Models"
            value={models.length}
            sub={`${new Set(models.map((m) => m.provider)).size} providers`}
            loading={false}
          />
        </section>

        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Most used models</h2>
            <div className="flex rounded-lg border border-base-700/60 bg-base-900/40 p-0.5 text-xs">
              {(
                [
                  ["all", "All time"],
                  ["month", monthLabel],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setRange(value)}
                  aria-pressed={range === value}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    range === value ? "bg-base-700 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(range === "all" ? stats === null : monthly === null) ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : ranked.length === 0 ? (
            <p className="rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-6 text-center text-sm text-slate-500">
              No replies recorded {range === "month" ? "this month" : "yet"}.
            </p>
          ) : (
            <>
              <ol className="divide-y divide-base-700/50 overflow-hidden rounded-xl border border-base-700/60 bg-base-900/40">
                {visible.map((row) => (
                  <ModelRow key={row.slug} row={row} range={range} />
                ))}
              </ol>
              {ranked.length > 10 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-slate-400 hover:text-white">
                  {showAll ? "Show top 10" : `Show all ${ranked.length} models`}
                </button>
              )}
            </>
          )}
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Replies · last 14 days</h2>
            <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-4">
              {loading ? <p className="text-sm text-slate-500">Loading…</p> : <DailyChart days={days14} />}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By mode</h2>
            <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-4">
              {loading ? <p className="text-sm text-slate-500">Loading…</p> : <BarList rows={modeRows} empty="No replies by mode yet." />}
            </div>
          </section>
          <section className="md:col-span-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By provider</h2>
            <div className="rounded-xl border border-base-700/60 bg-base-900/40 p-4">
              {loading ? <p className="text-sm text-slate-500">Loading…</p> : <BarList rows={providerRows} empty="No replies by provider yet." />}
            </div>
          </section>
        </div>

        <p className="mt-8 flex items-start gap-2 text-xs text-slate-500">
          <Activity size={13} className="mt-0.5 shrink-0" />
          <span>
            Counters update in real time and never include who sent a message or what it said. "Chats saved" counts each chat once,
            when it gets its first message, and never goes down when a chat is deleted. Tokens are estimated (about 4 characters
            each) and cover your prompt plus the reply. Totals start from when tracking began, so they trail the real numbers.
          </span>
        </p>
      </div>
    </div>
  );
}
