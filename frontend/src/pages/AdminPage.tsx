import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldAlert,
  Loader2,
  Ban,
  RefreshCw,
  Gift,
} from "lucide-react";
import { useAuthStore } from "../state/authStore";
import { useCatalogStore, publishCatalog, DEFAULT_USAGE, DEFAULT_WATERMARK } from "../lib/catalogSync";
import {
  PROVIDER_LABELS,
  catalogWithAdminAdditions,
  adminAddedKeys,
  modelKey,
  DEFAULT_MODEL_ID,
} from "../config/models";
import { ADMIN_EMAIL, isAdmin } from "../lib/admin";
import {
  fetchAllUsage,
  resetUserUsage,
  todayUTC,
  MEDIA_KEYS,
  IMAGE_BASE_CREDITS,
  SPEECH_CREDITS_PER_WORD,
  SPEECH_CREDITS_PER_SECOND,
} from "../lib/usage";
import { modelSlug } from "../lib/modelSlug";
import { ModelFavicon, ProviderFavicon } from "../components/ProviderIcon";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { LogoMark } from "../components/Logo";
import type { AdminCatalog, ModelDef, Provider, UsageConfig, UsageRecord, WatermarkConfig } from "../types";

/** Providers the admin can publish an official model against — the ones the Worker
 * already holds a key for, plus Puter (in-browser, no key). "custom" is per-browser only,
 * so it's not offered here. */
const PUBLISHABLE_PROVIDERS: Provider[] = ["xkiro", "mistral", "gemini", "openrouter", "zai", "puter"];

const DEFAULT_CONTEXT_LENGTH = 128000;

const inputClass =
  "w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 placeholder-slate-500";

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

type PatchableCatalog = Partial<Pick<AdminCatalog, "added" | "hiddenKeys" | "usage" | "watermark">>;

function GateScreen({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-base-950 px-6 text-center">
      <ShieldAlert size={34} className="text-slate-500" />
      <h1 className="text-lg font-semibold text-white">Admins only</h1>
      <p className="max-w-sm text-sm text-slate-400">
        {user
          ? `You're signed in as ${user.email ?? "an unknown account"}. The shared model catalog can only be edited by ${ADMIN_EMAIL}.`
          : `Sign in as ${ADMIN_EMAIL} to edit the shared model catalog.`}
      </p>
      <div className="flex gap-2">
        {!user && (
          <button
            onClick={signInWithGoogle}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
          >
            Sign in with Google
          </button>
        )}
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

/* ─────────────────────────── Models tab ─────────────────────────── */

function ModelsTab({
  catalog,
  busy,
  run,
}: {
  catalog: AdminCatalog;
  busy: boolean;
  run: (patch: PatchableCatalog) => void;
}) {
  const [form, setForm] = useState({
    displayName: "",
    modelId: "",
    provider: PUBLISHABLE_PROVIDERS[0] as Provider,
    contextLength: "",
    logoUrl: "",
    description: "",
    supportsVision: false,
  });

  const hiddenSet = useMemo(() => new Set(catalog.hiddenKeys), [catalog.hiddenKeys]);
  const addedSet = useMemo(() => new Set(adminAddedKeys()), [catalog.added]);

  const grouped = useMemo(() => {
    const g = {} as Record<string, ModelDef[]>;
    for (const m of catalogWithAdminAdditions()) (g[m.provider] ??= []).push(m);
    for (const list of Object.values(g)) list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const addModel = () => {
    const displayName = form.displayName.trim();
    const modelId = form.modelId.trim();
    if (!displayName || !modelId) return;
    const parsed = Math.floor(Number(form.contextLength));
    const contextLength = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONTEXT_LENGTH;
    const model: ModelDef = {
      provider: form.provider,
      modelId,
      displayName,
      icon: "Sparkles",
      contextLength,
      capabilities: form.supportsVision ? ["text", "vision"] : ["text"],
      free: true,
      supportsStreaming: true,
      supportsVision: form.supportsVision,
      description: form.description.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
    };
    const key = modelKey(model);
    run({
      added: [...catalog.added.filter((m) => modelKey(m) !== key), model],
      hiddenKeys: catalog.hiddenKeys.filter((k) => k !== key),
    });
    setForm({
      displayName: "",
      modelId: "",
      provider: form.provider,
      contextLength: "",
      logoUrl: "",
      description: "",
      supportsVision: false,
    });
  };

  const deleteAdded = (key: string) =>
    run({
      added: catalog.added.filter((m) => modelKey(m) !== key),
      hiddenKeys: catalog.hiddenKeys.filter((k) => k !== key),
    });

  const hide = (key: string) => run({ hiddenKeys: [...new Set([...catalog.hiddenKeys, key])] });
  const unhide = (key: string) => run({ hiddenKeys: catalog.hiddenKeys.filter((k) => k !== key) });

  const providers = Object.keys(grouped).sort() as Provider[];

  return (
    <>
      <p className="mb-5 rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-2 text-xs text-slate-400">
        Changes here are <span className="text-slate-200">global</span> — every visitor sees them after you publish.
        Individual users still add their own private models in Settings → Models.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Publish a model</h2>
        <div className="space-y-2 rounded-lg border border-dashed border-base-600/60 p-3">
          <input
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            placeholder="Display name (e.g. Mistral Large 3)"
            className={inputClass}
          />
          <input
            value={form.modelId}
            onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
            placeholder="Model ID sent to the provider (e.g. mistral-large-2512)"
            className={inputClass}
          />
          <select
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider }))}
            className={inputClass}
          >
            {PUBLISHABLE_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
          <input
            value={form.contextLength}
            onChange={(e) => setForm((f) => ({ ...f, contextLength: e.target.value.replace(/[^\d]/g, "") }))}
            inputMode="numeric"
            placeholder={`Context window in tokens (optional, default ${DEFAULT_CONTEXT_LENGTH.toLocaleString()})`}
            className={inputClass}
          />
          <input
            value={form.logoUrl}
            onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
            placeholder="Logo image URL (optional, e.g. https://example.com/logo.png)"
            className={inputClass}
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short description (optional, shown on the model's docs page)"
            rows={2}
            className={`${inputClass} resize-none`}
          />
          <ToggleSwitch
            label="Supports vision"
            checked={form.supportsVision}
            onChange={(v) => setForm((f) => ({ ...f, supportsVision: v }))}
          />
          <button
            onClick={addModel}
            disabled={busy || !form.displayName.trim() || !form.modelId.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} /> Publish model
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Catalog</h2>
        <div className="space-y-5">
          {providers.map((provider) => (
            <div key={provider}>
              <div className="mb-1.5 flex items-center gap-2">
                <ProviderFavicon provider={provider} size={14} />
                <span className="text-xs font-semibold text-slate-300">{PROVIDER_LABELS[provider]}</span>
              </div>
              <div className="space-y-1.5">
                {grouped[provider].map((m) => {
                  const key = modelKey(m);
                  const hidden = hiddenSet.has(key);
                  const added = addedSet.has(key);
                  const isDefault = m.provider === "xkiro" && m.modelId === DEFAULT_MODEL_ID;
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        hidden ? "border-base-700/40 bg-base-900/30 opacity-50" : "border-base-600/60 bg-base-900/60"
                      }`}
                    >
                      <ModelFavicon model={m} size={14} />
                      <span
                        className={`min-w-0 flex-1 truncate ${hidden ? "text-slate-500 line-through" : "text-slate-200"}`}
                      >
                        {m.displayName}
                      </span>
                      {added && (
                        <span className="hidden shrink-0 rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300 sm:inline">
                          Official
                        </span>
                      )}
                      <span className="hidden max-w-[150px] truncate text-xs text-slate-500 sm:inline" title={m.modelId}>
                        {m.modelId}
                      </span>
                      {!!m.contextLength && (
                        <span className="hidden shrink-0 text-xs text-slate-600 sm:inline">
                          {formatContext(m.contextLength)}
                        </span>
                      )}
                      {m.supportsVision && <Eye size={12} className="shrink-0 text-sky-400" />}
                      {added ? (
                        <button
                          onClick={() => deleteAdded(key)}
                          disabled={busy}
                          className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                          title="Delete this published model"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : hidden ? (
                        <button
                          onClick={() => unhide(key)}
                          disabled={busy}
                          className="rounded p-1 text-slate-500 hover:bg-base-700 hover:text-white disabled:opacity-40"
                          title="Restore this model for everyone"
                        >
                          <RotateCcw size={13} />
                        </button>
                      ) : (
                        <button
                          onClick={() => hide(key)}
                          disabled={busy || isDefault}
                          className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                          title={isDefault ? "The default model can't be hidden" : "Hide this model from everyone"}
                        >
                          <EyeOff size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────── Limits tab ─────────────────────────── */

function LimitsTab({
  catalog,
  busy,
  run,
}: {
  catalog: AdminCatalog;
  busy: boolean;
  run: (patch: PatchableCatalog) => void;
}) {
  const published = catalog.usage ?? DEFAULT_USAGE;
  const [draft, setDraft] = useState<UsageConfig>(published);

  // Re-sync the draft whenever a fresh catalog lands (e.g. another admin tab published).
  useEffect(() => {
    setDraft(published);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.updatedAt]);

  const grouped = useMemo(() => {
    const g = {} as Record<string, ModelDef[]>;
    for (const m of catalogWithAdminAdditions()) (g[m.provider] ??= []).push(m);
    for (const list of Object.values(g)) list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(published);

  const setMultiplier = (key: string, raw: string) => {
    const v = Number(raw);
    setDraft((d) => {
      const modelCredits = { ...d.modelCredits };
      if (!raw.trim() || !Number.isFinite(v) || v < 0 || v === 1) delete modelCredits[key];
      else modelCredits[key] = v;
      return { ...d, modelCredits };
    });
  };

  const togglePostLimit = (key: string) =>
    setDraft((d) => ({
      ...d,
      postLimitKeys: d.postLimitKeys.includes(key)
        ? d.postLimitKeys.filter((k) => k !== key)
        : [...d.postLimitKeys, key],
    }));

  const providers = Object.keys(grouped).sort() as Provider[];

  return (
    <>
      <p className="mb-5 rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-2 text-xs text-slate-400">
        Every signed-in user gets this many credits per UTC day (1 credit ≈ 1 token, prompt + reply). When they run out,
        only the free default model and the models you tick below still work until 00:00 UTC.
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Daily credits per user</h2>
        <input
          value={String(draft.dailyCredits)}
          onChange={(e) => {
            const v = Math.floor(Number(e.target.value.replace(/[^\d]/g, "")));
            setDraft((d) => ({ ...d, dailyCredits: Number.isFinite(v) && v >= 0 ? v : 0 }));
          }}
          inputMode="numeric"
          className={`${inputClass} max-w-xs`}
        />
        <p className="mt-1 text-xs text-slate-600">{draft.dailyCredits.toLocaleString()} credits/day · default 1,000,000</p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Per-model cost &amp; post-limit access</h2>
        <div className="mb-2 flex items-center gap-4 px-1 text-[10px] uppercase tracking-wide text-slate-600">
          <span className="flex-1">Model</span>
          <span className="w-16 text-center">Cost ×</span>
          <span className="w-24 text-center">After limit</span>
        </div>
        <div className="space-y-5">
          {providers.map((provider) => (
            <div key={provider}>
              <div className="mb-1.5 flex items-center gap-2">
                <ProviderFavicon provider={provider} size={14} />
                <span className="text-xs font-semibold text-slate-300">{PROVIDER_LABELS[provider]}</span>
              </div>
              <div className="space-y-1.5">
                {grouped[provider].map((m) => {
                  const key = modelKey(m);
                  const isDefault = m.provider === "xkiro" && m.modelId === DEFAULT_MODEL_ID;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-4 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm"
                    >
                      <ModelFavicon model={m} size={14} />
                      <span className="min-w-0 flex-1 truncate text-slate-200">{m.displayName}</span>
                      <input
                        value={draft.modelCredits[key] ?? ""}
                        onChange={(e) => setMultiplier(key, e.target.value)}
                        placeholder="1"
                        inputMode="decimal"
                        className="w-16 rounded border border-base-600/60 bg-base-900 px-2 py-1 text-center text-xs text-white outline-none focus:border-accent-500"
                      />
                      <span className="flex w-24 justify-center">
                        {isDefault ? (
                          <span className="text-[10px] uppercase tracking-wide text-accent-300">Always</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={draft.postLimitKeys.includes(key)}
                            onChange={() => togglePostLimit(key)}
                            className="h-4 w-4 accent-accent-500"
                          />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Image &amp; speech cost</h2>
        <p className="mb-2 text-xs text-slate-600">
          Base cost per generation, scaled by the multiplier (blank = 1×, 0 = free). Speech also bills{" "}
          {SPEECH_CREDITS_PER_SECOND} per second of audio produced.
        </p>
        <div className="space-y-1.5">
          {[
            { key: MEDIA_KEYS.imageCloudflare, label: "Cloudflare Flux (image)", base: `${IMAGE_BASE_CREDITS.cloudflare.toLocaleString()} / image` },
            { key: MEDIA_KEYS.imageXkiro, label: "GPT Image", base: `${IMAGE_BASE_CREDITS.xkiro.toLocaleString()} / image` },
            {
              key: MEDIA_KEYS.imageXkiroFree,
              label: "SenseNova U1.5 Lite (image)",
              base: `${IMAGE_BASE_CREDITS["xkiro-free"].toLocaleString()} / image`,
            },
            { key: MEDIA_KEYS.speech, label: "Text to speech", base: `${SPEECH_CREDITS_PER_WORD} / word` },
          ].map(({ key, label, base }) => (
            <div
              key={key}
              className="flex items-center gap-4 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-slate-200">{label}</span>
              <span className="shrink-0 text-[10px] text-slate-600">{base}</span>
              <input
                value={draft.modelCredits[key] ?? ""}
                onChange={(e) => setMultiplier(key, e.target.value)}
                placeholder="1"
                inputMode="decimal"
                className="w-16 rounded border border-base-600/60 bg-base-900 px-2 py-1 text-center text-xs text-white outline-none focus:border-accent-500"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 mt-6 flex items-center gap-2 border-t border-base-700/60 bg-base-950/90 py-3 backdrop-blur">
        <button
          onClick={() => run({ usage: draft })}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publish limits
        </button>
        {dirty && (
          <button
            onClick={() => setDraft(published)}
            className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            Discard changes
          </button>
        )}
        {dirty && <span className="text-xs text-amber-400">Unpublished changes</span>}
      </div>
    </>
  );
}

/* ─────────────────────────── Users tab ─────────────────────────── */

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function UsersTab({
  catalog,
  busy,
  run,
}: {
  catalog: AdminCatalog;
  busy: boolean;
  run: (patch: PatchableCatalog) => void;
}) {
  const usage = catalog.usage ?? DEFAULT_USAGE;
  const [records, setRecords] = useState<Record<string, UsageRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const slugToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of catalogWithAdminAdditions()) map.set(modelSlug(m.modelId), m.displayName);
    return map;
  }, [catalog]);

  const load = () => {
    setLoading(true);
    setErr(null);
    fetchAllUsage()
      .then((r) => {
        if (r === null) setErr("Couldn't read usage records — check the RTDB rule for the \"usage\" path (see lib/catalogSync.ts).");
        setRecords(r ?? {});
      })
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const today = todayUTC();
  const rows = Object.entries(records ?? {})
    .map(([uid, rec]) => {
      const todays = rec && rec.day === today ? rec : null;
      const used = todays?.credits ?? 0;
      const models = Object.entries(todays?.models ?? {}).sort((a, b) => b[1] - a[1]);
      return {
        uid,
        email: rec?.email ?? null,
        used,
        topModel: models[0] ? slugToName.get(models[0][0]) ?? models[0][0] : null,
        updatedAt: rec?.updatedAt ?? 0,
        blocked: usage.blockedUids.includes(uid),
        bonus: usage.bonus[uid]?.day === today ? usage.bonus[uid].credits : 0,
      };
    })
    .sort((a, b) => b.used - a.used);

  const limit = usage.dailyCredits;

  const grantBonus = (uid: string) => {
    const raw = window.prompt("Bonus credits to add for today (a number). 0 clears it.");
    if (raw === null) return;
    const v = Math.floor(Number(raw));
    if (!Number.isFinite(v) || v < 0) return;
    const bonus = { ...usage.bonus };
    if (v === 0) delete bonus[uid];
    else bonus[uid] = { day: today, credits: v };
    run({ usage: { ...usage, bonus } });
  };

  const toggleBlock = (uid: string, blocked: boolean) => {
    const blockedUids = blocked ? usage.blockedUids.filter((u) => u !== uid) : [...new Set([...usage.blockedUids, uid])];
    run({ usage: { ...usage, blockedUids } });
  };

  const doReset = async (uid: string, email: string | null) => {
    try {
      await resetUserUsage(uid, email);
      load();
    } catch {
      setErr("Reset failed — the admin \".write\" clause on \"usage/$uid\" may be missing (see lib/catalogSync.ts).");
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Everyone who's used a gated model while signed in. Credits shown are for the current UTC day.
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-base-600/60 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>
      )}

      {loading && !records && <p className="text-sm text-slate-500">Loading users…</p>}
      {!loading && rows.length === 0 && (
        <p className="rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-6 text-center text-sm text-slate-500">
          No usage recorded yet.
        </p>
      )}

      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = limit > 0 ? Math.min(100, Math.round((r.used / (limit + r.bonus)) * 100)) : 100;
          return (
            <div key={r.uid} className="rounded-lg border border-base-600/60 bg-base-900/60 p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{r.email ?? r.uid}</span>
                {r.blocked && (
                  <span className="flex shrink-0 items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                    <Ban size={10} /> Blocked
                  </span>
                )}
                {r.bonus > 0 && (
                  <span className="shrink-0 rounded bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-300">
                    +{r.bonus.toLocaleString()}
                  </span>
                )}
                <span className="shrink-0 text-xs text-slate-500">{r.updatedAt ? relativeTime(r.updatedAt) : "—"}</span>
              </div>

              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-700/60">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? "bg-red-400" : "bg-accent-500/70"}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <span className="shrink-0">
                  {r.used.toLocaleString()} / {(limit + r.bonus).toLocaleString()}
                </span>
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {r.topModel ? `Most used: ${r.topModel}` : "No usage today"}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => grantBonus(r.uid)}
                    disabled={busy}
                    title="Grant bonus credits for today"
                    className="rounded p-1 text-slate-500 hover:bg-base-700 hover:text-accent-300 disabled:opacity-40"
                  >
                    <Gift size={13} />
                  </button>
                  <button
                    onClick={() => doReset(r.uid, r.email)}
                    disabled={busy}
                    title="Reset today's usage"
                    className="rounded p-1 text-slate-500 hover:bg-base-700 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => toggleBlock(r.uid, r.blocked)}
                    disabled={busy}
                    title={r.blocked ? "Unblock" : "Block from non-default models"}
                    className={`rounded p-1 disabled:opacity-40 ${
                      r.blocked
                        ? "text-red-400 hover:bg-base-700"
                        : "text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                    }`}
                  >
                    <Ban size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────────────────── Watermark tab ─────────────────────────── */

const PREVIEW_W = 300; // px the sample renders at
const NOMINAL_IMG_W = 512; // px the sample "image" stands in for

function WatermarkTab({
  catalog,
  busy,
  run,
}: {
  catalog: AdminCatalog;
  busy: boolean;
  run: (patch: PatchableCatalog) => void;
}) {
  const published = catalog.watermark ?? DEFAULT_WATERMARK;
  const [draft, setDraft] = useState<WatermarkConfig>(published);

  useEffect(() => {
    setDraft(published);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.updatedAt]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(published);

  // Mirror lib/watermark.ts: clamp(12, 48, round(width * scale)), shown at preview scale.
  const realFont = Math.max(12, Math.min(48, Math.round(NOMINAL_IMG_W * draft.scale)));
  const previewFont = realFont * (PREVIEW_W / NOMINAL_IMG_W);
  const previewPad = previewFont * 0.7;

  return (
    <>
      <p className="mb-5 rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-2 text-xs text-slate-400">
        Stamped on <span className="text-slate-200">every generated image</span>, in the browser, right after it comes
        back. Applies to all users once you publish. Turning it off leaves images untouched.
      </p>

      <div className="flex flex-col gap-6 sm:flex-row">
        <section className="flex-1 space-y-5">
          <ToggleSwitch
            label="Watermark generated images"
            checked={draft.enabled}
            onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          />

          <div className={draft.enabled ? "space-y-5" : "pointer-events-none space-y-5 opacity-40"}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Text</label>
              <input
                value={draft.text}
                maxLength={40}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                placeholder="ScribbleAI"
                className={inputClass}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Opacity</span>
                <span className="text-slate-400">{Math.round(draft.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={Math.round(draft.opacity * 100)}
                onChange={(e) => setDraft((d) => ({ ...d, opacity: Number(e.target.value) / 100 }))}
                className="w-full accent-accent-500"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Size</span>
                <span className="text-slate-400">{(draft.scale * 100).toFixed(1)}% of width</span>
              </div>
              <input
                type="range"
                min={5}
                max={150}
                step={1}
                value={Math.round(draft.scale * 1000)}
                onChange={(e) => setDraft((d) => ({ ...d, scale: Number(e.target.value) / 1000 }))}
                className="w-full accent-accent-500"
              />
              <p className="mt-1 text-xs text-slate-600">
                ≈ {realFont}px on a {NOMINAL_IMG_W}px image (clamped 12–48px)
              </p>
            </div>
          </div>
        </section>

        <section className="shrink-0">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</span>
          <div
            className="relative overflow-hidden rounded-lg border border-base-600/60"
            style={{ width: PREVIEW_W, height: PREVIEW_W }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#1d2740] via-[#2e3b5e] to-[#3f5233]" />
            <div className="absolute right-[18%] top-[16%] h-14 w-14 rounded-full bg-[#f0c987]/90" />
            {draft.enabled && draft.text.trim() && (
              <span
                className="absolute font-semibold leading-none text-white"
                style={{
                  right: previewPad,
                  bottom: previewPad,
                  fontSize: previewFont,
                  opacity: draft.opacity,
                  textShadow: `0 1px ${previewFont * 0.35}px rgba(0,0,0,${(draft.opacity * 0.65).toFixed(2)})`,
                }}
              >
                {draft.text}
              </span>
            )}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 mt-6 flex items-center gap-2 border-t border-base-700/60 bg-base-950/90 py-3 backdrop-blur">
        <button
          onClick={() => run({ watermark: draft })}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publish watermark
        </button>
        {dirty && (
          <button
            onClick={() => setDraft(published)}
            className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
          >
            Discard changes
          </button>
        )}
        <button
          onClick={() => setDraft(DEFAULT_WATERMARK)}
          className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          Reset to default
        </button>
        {dirty && <span className="text-xs text-amber-400">Unpublished changes</span>}
      </div>
    </>
  );
}

/* ─────────────────────────── Shell ─────────────────────────── */

const TABS = [
  { id: "models", label: "Models" },
  { id: "users", label: "Users" },
  { id: "limits", label: "Limits" },
  { id: "watermark", label: "Watermark" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function AdminPage({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  const catalog = useCatalogStore((s) => s.catalog);

  const [tab, setTab] = useState<TabId>("models");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (patch: PatchableCatalog) => {
    setBusy(true);
    setError(null);
    try {
      await publishCatalog({
        added: catalog.added,
        hiddenKeys: catalog.hiddenKeys,
        usage: catalog.usage ?? DEFAULT_USAGE,
        watermark: catalog.watermark ?? DEFAULT_WATERMARK,
        ...patch,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't publish the change.";
      setError(
        /permission/i.test(msg)
          ? 'Permission denied by the database. Add a Realtime Database rule granting write on "catalog" to this account (see lib/catalogSync.ts for the exact rule), then try again.'
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin(user)) return <GateScreen onExit={onExit} />;

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <header className="sticky top-0 z-10 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
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
            <h1 className="text-sm font-semibold text-white">Scribble admin</h1>
            <p className="truncate text-xs text-slate-500">signed in as {user!.email}</p>
          </div>
          {busy && <Loader2 size={15} className="ml-auto animate-spin text-slate-400" />}
        </div>
        <nav className="mt-2 flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-accent-500/15 text-accent-400" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {tab === "models" && <ModelsTab catalog={catalog} busy={busy} run={run} />}
        {tab === "limits" && <LimitsTab catalog={catalog} busy={busy} run={run} />}
        {tab === "users" && <UsersTab catalog={catalog} busy={busy} run={run} />}
        {tab === "watermark" && <WatermarkTab catalog={catalog} busy={busy} run={run} />}
      </div>
    </div>
  );
}
