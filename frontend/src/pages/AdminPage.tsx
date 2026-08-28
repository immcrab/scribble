import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, RotateCcw, ShieldAlert, Loader2 } from "lucide-react";
import { useAuthStore } from "../state/authStore";
import { useCatalogStore, publishCatalog } from "../lib/catalogSync";
import {
  PROVIDER_LABELS,
  catalogWithAdminAdditions,
  adminAddedKeys,
  modelKey,
  DEFAULT_MODEL_ID,
} from "../config/models";
import { ADMIN_EMAIL, isAdmin } from "../lib/admin";
import { ModelFavicon, ProviderFavicon } from "../components/ProviderIcon";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { LogoMark } from "../components/Logo";
import type { ModelDef, Provider } from "../types";

/** Providers the admin can publish an official model against — the ones the Worker
 * already holds a key for, plus Puter (in-browser, no key). "custom" is per-browser only,
 * so it's not offered here. */
const PUBLISHABLE_PROVIDERS: Provider[] = ["xkiro", "mistral", "gemini", "openrouter", "puter"];

const DEFAULT_CONTEXT_LENGTH = 128000;

const inputClass =
  "w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 placeholder-slate-500";

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

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

export function AdminPage({ onExit }: { onExit: () => void }) {
  const user = useAuthStore((s) => s.user);
  const catalog = useCatalogStore((s) => s.catalog);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Full catalog (built-ins + admin additions) grouped by provider, recomputed whenever
  // the published catalog changes.
  const grouped = useMemo(() => {
    const g = {} as Record<string, ModelDef[]>;
    for (const m of catalogWithAdminAdditions()) (g[m.provider] ??= []).push(m);
    for (const list of Object.values(g)) list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  if (!isAdmin(user)) return <GateScreen onExit={onExit} />;

  const run = async (next: { added: ModelDef[]; hiddenKeys: string[] }) => {
    setBusy(true);
    setError(null);
    try {
      await publishCatalog(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't publish the change.";
      setError(
        /permission/i.test(msg)
          ? "Permission denied by the database. Add a Realtime Database rule granting write on \"catalog\" to this account (see lib/catalogSync.ts for the exact rule), then try again."
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

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
    // Publishing a model also un-hides that key, in case it was hidden before.
    void run({
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

  const hide = (key: string) =>
    run({ added: catalog.added, hiddenKeys: [...new Set([...catalog.hiddenKeys, key])] });

  const unhide = (key: string) =>
    run({ added: catalog.added, hiddenKeys: catalog.hiddenKeys.filter((k) => k !== key) });

  const providers = Object.keys(grouped).sort() as Provider[];
  const totalVisible = providers.reduce(
    (n, p) => n + grouped[p].filter((m) => !hiddenSet.has(modelKey(m))).length,
    0
  );

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
          <h1 className="text-sm font-semibold text-white">Model catalog admin</h1>
          <p className="truncate text-xs text-slate-500">
            {totalVisible} models live · signed in as {user!.email}
          </p>
        </div>
        {busy && <Loader2 size={15} className="ml-auto animate-spin text-slate-400" />}
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <p className="mb-5 rounded-lg border border-base-700/60 bg-base-900/40 px-3 py-2 text-xs text-slate-400">
          Changes here are <span className="text-slate-200">global</span> — every visitor sees them after you
          publish. Individual users still add their own private models in Settings → Models.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Add an official model */}
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

        {/* The full catalog */}
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
                          hidden
                            ? "border-base-700/40 bg-base-900/30 opacity-50"
                            : "border-base-600/60 bg-base-900/60"
                        }`}
                      >
                        <ModelFavicon model={m} size={14} />
                        <span className={`min-w-0 flex-1 truncate ${hidden ? "text-slate-500 line-through" : "text-slate-200"}`}>
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
      </div>
    </div>
  );
}
