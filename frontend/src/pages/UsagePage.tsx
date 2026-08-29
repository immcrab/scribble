import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gauge, LogIn, TriangleAlert, Ban, Image as ImageIcon, AudioLines } from "lucide-react";
import { useAuthStore } from "../state/authStore";
import { useUsageStore, creditStatus, creditMultiplier, MEDIA_LABELS } from "../lib/usage";
import { useCatalogStore } from "../lib/catalogSync";
import { getAllModels, modelKey } from "../config/models";
import { modelSlug } from "../lib/modelSlug";
import { ModelFavicon } from "../components/ProviderIcon";
import { LogoMark } from "../components/Logo";
import type { ModelDef } from "../types";

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "any moment";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function Ring({ fraction, danger }: { fraction: number; danger: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.round(fraction * 100);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-base-700/60" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, fraction))}
          className={danger ? "stroke-red-400 transition-[stroke-dashoffset]" : "stroke-accent-500 transition-[stroke-dashoffset]"}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold ${danger ? "text-red-300" : "text-white"}`}>{pct}%</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">used</span>
      </div>
    </div>
  );
}

function GateScreen({ onExit }: { onExit: () => void }) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-base-950 px-6 text-center">
      <Gauge size={34} className="text-slate-500" />
      <h1 className="text-lg font-semibold text-white">Sign in to see your usage</h1>
      <p className="max-w-sm text-sm text-slate-400">
        Daily credits and the model breakdown are tracked per account. The free default model works without one.
      </p>
      <div className="flex gap-2">
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
        >
          <LogIn size={14} /> Sign in with Google
        </button>
        <button
          onClick={onExit}
          className="rounded-lg border border-base-600/60 bg-base-800/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent-500/50 hover:text-white"
        >
          Back to Scribble
        </button>
      </div>
    </div>
  );
}

export function UsagePage({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  // Re-render on every usage write and on admin config changes.
  const record = useUsageStore((s) => s.record);
  const loaded = useUsageStore((s) => s.loaded);
  const catalog = useCatalogStore((s) => s.catalog);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const status = useMemo(() => creditStatus(), [record, catalog, now]);
  const models = useMemo(() => getAllModels(), [catalog]);
  const bySlug = useMemo(() => new Map(models.map((m) => [modelSlug(m.modelId), m])), [models]);

  if (!user) return <GateScreen onExit={onExit} />;

  const cfg = catalog.usage ?? { dailyCredits: 0, postLimitKeys: [], modelCredits: {}, blockedUids: [], bonus: {} };
  const bonus = status.limit - cfg.dailyCredits;

  const breakdown = status.byModel
    .map((row) => ({ ...row, model: bySlug.get(row.slug) as ModelDef | undefined }))
    .filter((r) => r.credits > 0);
  const topModel = breakdown[0];
  const maxRow = breakdown[0]?.credits ?? 1;

  const postLimitModels = models.filter((m) => cfg.postLimitKeys.includes(modelKey(m)));

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
          title="Back to Scribble"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
          <LogoMark size={15} className="text-base-950" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white">Usage</h1>
          <p className="truncate text-xs text-slate-500">{user.email} · resets every 24h at 00:00 UTC</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {status.blocked && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
            <Ban size={14} className="mt-0.5 shrink-0" />
            <span>This account is currently limited to the free default model. Contact the admin to lift it.</span>
          </div>
        )}
        {!status.blocked && status.overLimit && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              You're out of credits for today. Only the free default model{postLimitModels.length ? " and the models below" : ""} work
              until the reset in {formatCountdown(status.resetsAt - now)}.
            </span>
          </div>
        )}

        {/* Summary */}
        <section className="flex flex-col items-center gap-5 rounded-xl border border-base-700/60 bg-base-900/40 p-5 sm:flex-row sm:gap-7">
          <Ring fraction={status.fraction} danger={status.overLimit} />
          <div className="grid flex-1 grid-cols-2 gap-4 text-center sm:text-left">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Used today</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{formatCredits(status.used)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Remaining</p>
              <p className={`mt-0.5 text-lg font-semibold ${status.overLimit ? "text-red-300" : "text-white"}`}>
                {formatCredits(status.remaining)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Daily limit</p>
              <p className="mt-0.5 text-lg font-semibold text-white">
                {formatCredits(status.limit)}
                {bonus > 0 && <span className="ml-1 text-xs font-normal text-accent-400">(+{formatCredits(bonus)} bonus)</span>}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Resets in</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{formatCountdown(status.resetsAt - now)}</p>
            </div>
          </div>
        </section>

        <p className="mt-3 text-xs text-slate-500">
          1 credit ≈ 1 token (your prompt + the model's reply, estimated). Some models cost more or less per token — set by
          the admin. The free default model never counts against your limit. Image generation and text to speech draw from
          the same pool — a flat cost per image (Cloudflare Flux is cheapest, GPT Image the priciest) and, for speech, a
          cost per word plus per second of audio.
        </p>

        {/* Most used */}
        {topModel?.model && (
          <section className="mt-6 rounded-xl border border-accent-500/30 bg-accent-500/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-400">Most used model today</p>
            <div className="mt-2 flex items-center gap-3">
              <ModelFavicon model={topModel.model} size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{topModel.model.displayName}</p>
                <p className="text-xs text-slate-500">
                  {formatCredits(topModel.credits)} credits · {Math.round((topModel.credits / (status.used || 1)) * 100)}% of
                  today's usage
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Breakdown */}
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By model</h2>
          {!loaded && <p className="text-sm text-slate-500">Loading…</p>}
          {loaded && breakdown.length === 0 && (
            <p className="rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-6 text-center text-sm text-slate-500">
              No usage yet today. Send a message to get started.
            </p>
          )}
          {breakdown.length > 0 && (
            <div className="space-y-1.5">
              {breakdown.map((row) => {
                const mult = row.model ? creditMultiplier(row.model) : 1;
                const mediaLabel = MEDIA_LABELS[row.slug];
                const MediaIcon = row.slug.startsWith("speech") ? AudioLines : ImageIcon;
                return (
                  <div
                    key={row.slug}
                    className="flex items-center gap-3 rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-2"
                  >
                    {row.model ? (
                      <ModelFavicon model={row.model} size={16} />
                    ) : mediaLabel ? (
                      <MediaIcon size={16} className="text-accent-400" />
                    ) : (
                      <Gauge size={16} className="text-slate-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-slate-200">
                          {row.model?.displayName ?? mediaLabel ?? row.slug}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {formatCredits(row.credits)}
                          {mult !== 1 && <span className="ml-1 text-slate-600">({mult}×)</span>}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-base-700/60">
                        <div
                          className="h-full rounded-full bg-accent-500/70"
                          style={{ width: `${Math.max(3, (row.credits / maxRow) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Post-limit models */}
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Available after you hit the limit
          </h2>
          <div className="rounded-lg border border-base-700/60 bg-base-900/40 p-3">
            <div className="flex items-center gap-2 border-b border-base-700/50 pb-2 text-sm text-slate-300">
              <span className="rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300">
                Always
              </span>
              Mistral Small 4 — the free default model
            </div>
            {postLimitModels.length === 0 ? (
              <p className="pt-2 text-xs text-slate-500">The admin hasn't opened any other models for post-limit use yet.</p>
            ) : (
              <div className="space-y-1.5 pt-2">
                {postLimitModels.map((m) => (
                  <div key={modelKey(m)} className="flex items-center gap-2 text-sm text-slate-300">
                    <ModelFavicon model={m} size={15} />
                    <span className="truncate">{m.displayName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
