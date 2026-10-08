import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Eye, Check, Sparkles, Star, Lock, TriangleAlert, Loader2, X, Code2, Brain, Search, Clock } from "lucide-react";
import type { ModelDef, Provider } from "../types";
import { modelsByProvider, PROVIDER_LABELS, isModelGated, modelKey } from "../config/models";
import { ModelFavicon, ProviderFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { PuterNoticeModal } from "./PuterNoticeModal";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { useCatalogStore } from "../lib/catalogSync";
import { isPuterSignedIn, listPuterModels, type PuterModelInfo } from "../lib/puterClient";
import { AUTO_MODEL, AUTO_MODEL_ID } from "../lib/autoModel";
import { useIsMobile } from "../lib/useMediaQuery";
import {
  useModelPrefs,
  isCodeModel,
  isReasoningModel,
  isVisionModel,
  type CapabilityFilter,
} from "../lib/modelPrefs";

export function ModelIcon({ name, model, size = 15 }: { name?: string; model?: ModelDef; size?: number }) {
  if (model) return <ModelFavicon model={model} size={size} />;
  return <Sparkles size={size} />;
}

/** Dropdown only renders its menu content while open — mounting/unmounting it each time —
 * so this picks up the unmount as the signal that the main dropdown just closed, and uses
 * it to close the Puter flyout too instead of leaving it open (and stateful) in the background. */
function CloseOnUnmount({ onUnmount }: { onUnmount: () => void }) {
  const ref = useRef(onUnmount);
  ref.current = onUnmount;
  // Empty deps: the cleanup must only fire on true unmount, not on every re-render —
  // the ref is what keeps it calling the latest `onUnmount` despite that.
  useEffect(() => () => ref.current(), []);
  return null;
}

function puterInfoToModelDef(info: PuterModelInfo): ModelDef {
  return {
    provider: "puter",
    modelId: info.id,
    displayName: info.name || info.id,
    icon: "Sparkles",
    contextLength: info.context ?? 128000,
    capabilities: ["text"],
    free: true,
    supportsStreaming: true,
    supportsVision: false,
  };
}

/** Compact capability chip. The visible icon keeps dense model rows scannable;
 * the accessible label and tooltip still explain every symbol. */
function Badge({ tone, icon, label, title }: { tone: string; icon: ReactNode; label: string; title: string }) {
  return (
    <span
      aria-label={label}
      title={`${label}: ${title}`}
      className={`inline-flex shrink-0 items-center justify-center rounded border p-1 text-[10px] font-semibold tracking-wide ${tone}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** 1000000 -> "1M", 262144 -> "262K" — compact context-window label for dense rows. */
function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round((tokens / 1_000_000) * 10) / 10}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

const TONE = {
  free: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  gated: "border-base-500/50 bg-base-700/40 text-slate-400",
  vision: "border-sky-500/30 bg-sky-500/15 text-sky-400",
  code: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  reasoning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  down: "border-amber-500/30 bg-amber-500/15 text-amber-400",
};

function ModelBadges({ model, locked }: { model: ModelDef; locked: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {model.knownBroken && <Badge tone={TONE.down} icon={<TriangleAlert size={10} strokeWidth={2.5} />} label="Down" title={model.knownBroken} />}
      {locked ? (
        <Badge tone={TONE.gated} icon={<Lock size={10} strokeWidth={2.5} />} label="Sign in" title="Sign in to use this model" />
      ) : (
        model.free && <Badge tone={TONE.free} icon={<span className="text-[9px] leading-none">$0</span>} label="Free" title="Free to use" />
      )}
      {isVisionModel(model) && <Badge tone={TONE.vision} icon={<Eye size={10} strokeWidth={2.5} />} label="Vision" title="Accepts image input" />}
      {isCodeModel(model) && <Badge tone={TONE.code} icon={<Code2 size={10} strokeWidth={2.5} />} label="Code" title="Tuned for code" />}
      {isReasoningModel(model) && <Badge tone={TONE.reasoning} icon={<Brain size={10} strokeWidth={2.5} />} label="Reasoning" title="Thinks before answering" />}
    </span>
  );
}

/**
 * One selectable model. The row button and the star toggle are siblings (not nested) so
 * each is its own tab stop with its own accessible name.
 */
function ModelRow({
  model,
  active,
  locked,
  onSelect,
  starred,
  onToggleStar,
  hideBadges,
}: {
  model: ModelDef;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
  starred?: boolean;
  onToggleStar?: () => void;
  hideBadges?: boolean;
}) {
  return (
    <div className={`group flex items-center ${active ? "row-active bg-accent-500/10" : ""}`}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        data-testid="model-option"
        data-model-key={modelKey(model)}
        onClick={onSelect}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-2 pl-3.5 pr-1 text-left text-sm transition-colors hover:bg-base-700/50 sm:min-h-9 ${
          active ? "font-medium text-white" : "text-slate-300"
        }`}
      >
        <ModelFavicon model={model} size={15} />
        <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
        {!hideBadges && model.contextLength > 0 && (
          <span title={`${model.contextLength.toLocaleString()} token context window`} className="hidden shrink-0 text-[10px] tabular-nums text-slate-600 sm:inline">
            {formatContext(model.contextLength)}
          </span>
        )}
        {!hideBadges && <ModelBadges model={model} locked={locked} />}
        {active ? <Check size={13} className="shrink-0 animate-pop-in text-accent-400" aria-label="Selected" /> : <span className="w-[13px] shrink-0" />}
      </button>
      {onToggleStar && (
        <button
          type="button"
          data-no-arrow=""
          onClick={onToggleStar}
          aria-pressed={!!starred}
          aria-label={starred ? `Remove ${model.displayName} from favorites` : `Add ${model.displayName} to favorites`}
          title={starred ? "Unstar" : "Star"}
          className={`flex h-11 w-10 shrink-0 items-center justify-center transition-colors sm:h-9 sm:w-8 ${
            starred ? "text-amber-400 hover:text-amber-300" : "text-slate-600 hover:text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          }`}
        >
          <Star size={13} fill={starred ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

function SectionHeader({ icon, label, count }: { icon: ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-2" role="presentation">
      {icon}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {count !== undefined && <span className="text-[11px] text-slate-600">{count}</span>}
    </div>
  );
}

const FILTERS: { id: CapabilityFilter; label: string; icon: ReactNode; test: (m: ModelDef, locked: boolean) => boolean }[] = [
  { id: "open", label: "No sign-in", icon: <Sparkles size={11} />, test: (_m, locked) => !locked },
  { id: "vision", label: "Vision", icon: <Eye size={11} />, test: (m) => isVisionModel(m) },
  { id: "code", label: "Code", icon: <Code2 size={11} />, test: (m) => isCodeModel(m) },
  { id: "reasoning", label: "Reasoning", icon: <Brain size={11} />, test: (m) => isReasoningModel(m) },
];

const FLYOUT_WIDTH = 320;
const FLYOUT_HEIGHT = 420;

export function ModelSelector({
  value,
  onChange,
  align = "left",
}: {
  value?: ModelDef;
  onChange: (m: ModelDef) => void;
  align?: "left" | "right";
}) {
  // Re-derive when the admin publishes catalog changes (see lib/catalogSync.ts),
  // or when the user adds/removes a custom model or Puter favorite — modelsByProvider()
  // reads the module-level caches that chatStore.updateSettings keeps in sync, so the
  // memo must depend on the same store slices to pick those edits up without a reload.
  const adminCatalog = useCatalogStore((s) => s.catalog);
  const customModels = useChatStore((s) => s.settings.customModels);
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const puterFavorites = useChatStore((s) => s.settings.puterFavoriteModels);
  const grouped = useMemo(() => modelsByProvider(), [adminCatalog, customModels, puterFavorites]);
  const updateSettings = useChatStore((s) => s.updateSettings);
  const favoriteKeys = useModelPrefs((s) => s.favorites);
  const recentKeys = useModelPrefs((s) => s.recents);
  const toggleStar = useModelPrefs((s) => s.toggleFavorite);
  const pushRecent = useModelPrefs((s) => s.pushRecent);
  const [pendingPuterModel, setPendingPuterModel] = useState<ModelDef | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [filters, setFilters] = useState<CapabilityFilter[]>([]);
  const [puterBrowseOpen, setPuterBrowseOpen] = useState(false);
  const [puterSearch, setPuterSearch] = useState("");
  const [catalog, setCatalog] = useState<PuterModelInfo[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const browseRowRef = useRef<HTMLDivElement>(null);
  // The portal below renders outside <Dropdown>'s render-prop scope, so it can't close
  // over that render's `close` callback directly — stash the latest one here instead.
  const closeMenuRef = useRef<() => void>(() => {});
  const isMobile = useIsMobile();
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  // The flyout renders in a portal (so it isn't clipped by the menu's own overflow-y-auto,
  // which forces overflow-x to clip too), so its position has to be measured in JS rather
  // than anchored with CSS. Flips to the trigger's left, and clamps vertically, when there's
  // no room — same idea as how the main Dropdown already knows to open left/right.
  useEffect(() => {
    if (!puterBrowseOpen || isMobile) return;
    function reposition() {
      const el = browseRowRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let left = r.right + 8;
      if (left + FLYOUT_WIDTH > window.innerWidth - 8) left = Math.max(8, r.left - FLYOUT_WIDTH - 8);
      let top = r.top;
      if (top + FLYOUT_HEIGHT > window.innerHeight - 8) top = Math.max(8, window.innerHeight - FLYOUT_HEIGHT - 8);
      setFlyoutPos({ top, left });
    }
    reposition();
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [puterBrowseOpen, isMobile]);

  // Puter's catalog is 800+ models — fetched lazily (only once the browse panel is
  // actually opened) and cached in puterClient.ts, so reopening the panel is instant.
  useEffect(() => {
    if (!puterBrowseOpen || catalog || catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(false);
    listPuterModels()
      .then((models) => setCatalog([...models].sort((a, b) => a.id.localeCompare(b.id))))
      .catch(() => setCatalogError(true))
      .finally(() => setCatalogLoading(false));
  }, [puterBrowseOpen, catalog, catalogLoading]);

  const matchingCatalog = useMemo(() => {
    if (!catalog) return [];
    const q = puterSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
  }, [catalog, puterSearch]);

  function isPuterFavorited(modelId: string): boolean {
    return puterFavorites.some((m) => m.modelId === modelId);
  }

  // Reads the store fresh rather than closing over the `puterFavorites` render
  // variable — two of these can fire back-to-back (e.g. unstar immediately
  // followed by picking another Puter model) faster than React re-renders,
  // and a stale closure would silently resurrect the model just removed.
  function currentPuterFavorites(): ModelDef[] {
    return useChatStore.getState().settings.puterFavoriteModels;
  }

  function togglePuterFavorite(model: ModelDef) {
    const favorites = currentPuterFavorites();
    updateSettings({
      puterFavoriteModels: favorites.some((m) => m.modelId === model.modelId)
        ? favorites.filter((m) => m.modelId !== model.modelId)
        : [...favorites, model],
    });
  }

  const isLocked = (m: ModelDef) => isModelGated(m) && !user;

  function selectModel(m: ModelDef, close: () => void) {
    if (isLocked(m)) {
      signInWithGoogle();
      return;
    }
    if (m.provider === "puter" && !isPuterSignedIn()) {
      setPendingPuterModel(m);
      close();
      return;
    }
    // Picking a Puter model favorites it — that's also what makes it resolvable later:
    // chats only persist a modelId string and look it up via findModel(), which searches
    // the curated catalog plus favorites/custom models, not Puter's full live catalog.
    if (m.provider === "puter" && !isPuterFavorited(m.modelId)) {
      const favorites = currentPuterFavorites();
      if (!favorites.some((f) => f.modelId === m.modelId)) {
        updateSettings({ puterFavoriteModels: [...favorites, m] });
      }
    }
    if (m.provider !== "puter") pushRecent(modelKey(m));
    onChange(m);
    close();
  }

  const providers = (Object.keys(grouped) as Provider[]).filter((p) => p !== "puter");
  const curated = useMemo(() => providers.flatMap((p) => grouped[p]), [grouped]);
  const byKey = useMemo(() => new Map(curated.map((m) => [modelKey(m), m])), [curated]);

  const mqTokens = modelQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const narrowing = mqTokens.length > 0 || filters.length > 0;
  const matchModel = (m: ModelDef) => {
    if (mqTokens.length > 0) {
      const hay = `${m.displayName} ${m.modelId} ${PROVIDER_LABELS[m.provider] ?? ""}`.toLowerCase();
      if (!mqTokens.every((t) => hay.includes(t))) return false;
    }
    return filters.every((f) => FILTERS.find((x) => x.id === f)!.test(m, isLocked(m)));
  };

  // Pinned sections only when browsing (not while searching/filtering). A model shown
  // in Favorites or Recent is left out of its provider group below, so every model
  // appears exactly once in the list.
  const favoriteModels = narrowing ? [] : favoriteKeys.map((k) => byKey.get(k)).filter((m): m is ModelDef => !!m);
  const recentModels = narrowing
    ? []
    : recentKeys
        .filter((k) => !favoriteKeys.includes(k))
        .map((k) => byKey.get(k))
        .filter((m): m is ModelDef => !!m);
  const pinned = new Set([...favoriteModels, ...recentModels].map(modelKey));

  const groups = providers
    .map((provider) => ({ provider, models: grouped[provider].filter((m) => !pinned.has(modelKey(m)) && matchModel(m)) }))
    .filter((g) => g.models.length > 0);

  const favoritedPuterModels = puterFavorites.filter(matchModel);
  const customPuterModels = (grouped.puter ?? []).filter((m) => m.isCustom && !isPuterFavorited(m.modelId)).filter(matchModel);
  const noResults = narrowing && groups.length === 0 && favoritedPuterModels.length === 0 && customPuterModels.length === 0;

  const row = (m: ModelDef, close: () => void) => {
    const k = modelKey(m);
    return (
      <ModelRow
        key={k}
        model={m}
        active={value?.modelId === m.modelId && value?.provider === m.provider}
        locked={isLocked(m)}
        onSelect={() => selectModel(m, close)}
        starred={favoriteKeys.includes(k)}
        onToggleStar={() => toggleStar(k)}
      />
    );
  };

  const toggleFilter = (id: CapabilityFilter) =>
    setFilters((cur) => (cur.includes(id) ? cur.filter((f) => f !== id) : [...cur, id]));

  return (
    <>
    <Dropdown
      align={align}
      label="Choose a model"
      mobileSheet
      menuClassName="max-h-[28rem] w-[25rem] max-w-[calc(100vw-1rem)]"
      trigger={({ open, toggle, menuId }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Model: ${value ? value.displayName : "none selected"}`}
          data-testid="model-selector"
          className="flex min-h-11 items-center gap-2 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 transition-[border-color,background-color,box-shadow] duration-200 hover:border-accent-500/50 hover:bg-base-700/60 hover:shadow-lift sm:min-h-0"
        >
          <ModelFavicon model={value} size={15} />
          <span className="max-w-[160px] truncate">{value ? value.displayName : "Select model"}</span>
          {value?.knownBroken && (
            <span title={value.knownBroken} className="inline-flex shrink-0 items-center text-amber-400">
              <TriangleAlert size={12} strokeWidth={2.5} />
            </span>
          )}
          {value && isVisionModel(value) && (
            <span
              title="Supports vision input"
              className="hidden sm:inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-sky-400"
            >
              <Eye size={9} strokeWidth={2.5} />
              Vision
            </span>
          )}
          <ChevronDown size={13} aria-hidden="true" className={`text-slate-500 transition-transform duration-200 ease-out-expo ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => {
        closeMenuRef.current = close;
        return (
        <>
          <CloseOnUnmount onUnmount={() => { setPuterBrowseOpen(false); setModelQuery(""); setFilters([]); }} />
          <div className="sticky top-0 z-10 space-y-2 border-b border-base-700/60 bg-base-850 p-2">
            <label className="relative block">
              <span className="sr-only">Search models</span>
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                data-autofocus={isMobile ? undefined : ""}
                type="search"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Search models…"
                aria-controls="model-results"
                data-testid="model-search"
                className="w-full rounded-md border border-base-600/60 bg-base-900/60 py-2 pl-8 pr-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none sm:py-1.5"
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by capability">
              {FILTERS.filter((f) => f.id !== "open" || !user).map((f) => {
                const on = filters.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-no-arrow=""
                    aria-pressed={on}
                    data-testid={`model-filter-${f.id}`}
                    onClick={() => toggleFilter(f.id)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors sm:min-h-0 sm:py-0.5 ${
                      on ? "border-accent-500/60 bg-accent-500/15 text-white" : "border-base-600/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span aria-hidden="true">{f.icon}</span>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div id="model-results">
            {narrowing && !noResults && (
              <p className="px-3.5 pb-0.5 pt-2 text-[11px] text-slate-500" role="status" aria-live="polite">
                {groups.reduce((n, g) => n + g.models.length, 0) + favoritedPuterModels.length + customPuterModels.length} matching models
              </p>
            )}
            {!narrowing && (
              <div className="border-b border-base-700/40 p-1.5">
                <ModelRow
                  model={AUTO_MODEL}
                  active={value?.modelId === AUTO_MODEL_ID}
                  locked={!user}
                  hideBadges
                  onSelect={() => {
                    if (!user) { signInWithGoogle(); return; }
                    onChange(AUTO_MODEL);
                    close();
                  }}
                />
                <p className="px-3.5 pb-1 text-[11px] text-slate-500">Signed in only · picks the best available model each message.</p>
              </div>
            )}

            {favoriteModels.length > 0 && (
              <div role="group" aria-label="Favorites" className="menu-cascade border-b border-base-700/40 py-1">
                <SectionHeader icon={<Star size={12} className="text-amber-400" fill="currentColor" aria-hidden="true" />} label="Favorites" />
                {favoriteModels.map((m) => row(m, close))}
              </div>
            )}
            {recentModels.length > 0 && (
              <div role="group" aria-label="Recent" className="menu-cascade border-b border-base-700/40 py-1">
                <SectionHeader icon={<Clock size={12} className="text-slate-400" aria-hidden="true" />} label="Recent" />
                {recentModels.map((m) => row(m, close))}
              </div>
            )}

            {groups.map(({ provider, models }) => (
              <div key={provider} role="group" aria-label={PROVIDER_LABELS[provider]} className="menu-cascade border-b border-base-700/40 py-1 last:border-b-0">
                <SectionHeader icon={<ProviderFavicon provider={provider} size={13} />} label={PROVIDER_LABELS[provider]} count={models.length} />
                {models.map((m) => row(m, close))}
              </div>
            ))}

            {noResults && (
              <p className="px-3.5 py-3 text-xs text-slate-500" role="status">
                No models match{modelQuery.trim() ? ` "${modelQuery.trim()}"` : " these filters"}. Try "Browse all Puter models" below.
              </p>
            )}

            <div role="group" aria-label="Puter.js" className="py-1">
              <SectionHeader icon={<ProviderFavicon provider="puter" size={13} />} label="Puter.js" />

              {favoritedPuterModels.map((m) => (
                <ModelRow
                  key={modelKey(m)}
                  model={m}
                  active={value?.modelId === m.modelId}
                  locked={isLocked(m)}
                  onSelect={() => selectModel(m, close)}
                  starred
                  onToggleStar={() => togglePuterFavorite(m)}
                />
              ))}

              {customPuterModels.map((m) => (
                <ModelRow
                  key={modelKey(m)}
                  model={m}
                  active={value?.modelId === m.modelId}
                  locked={isLocked(m)}
                  onSelect={() => selectModel(m, close)}
                />
              ))}

              {favoritedPuterModels.length === 0 && customPuterModels.length === 0 && (
                <p className="px-3.5 py-1.5 text-xs text-slate-500">
                  Puter.js has 800+ free models — pick or star one below to pin it here.
                </p>
              )}

              <div ref={browseRowRef}>
                <button
                  type="button"
                  aria-expanded={puterBrowseOpen}
                  onClick={() => setPuterBrowseOpen((o) => !o)}
                  className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 sm:min-h-0 ${
                    puterBrowseOpen ? "text-slate-200" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles size={15} className="shrink-0 text-violet-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Browse all Puter models</span>
                  <ChevronRight size={13} className="shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </>
        );
      }}
    </Dropdown>

    {puterBrowseOpen &&
      createPortal(
        <>
          {isMobile && <div className="fixed inset-0 z-[74] bg-black/50 animate-fade-in" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPuterBrowseOpen(false)} />}
          <div
            role="dialog"
            aria-label="Puter.js models"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setPuterBrowseOpen(false);
              }
            }}
            style={isMobile ? undefined : { top: flyoutPos?.top ?? 0, left: flyoutPos?.left ?? 0 }}
            className={
              isMobile
                ? "fixed inset-x-3 bottom-3 z-[75] flex max-h-[70vh] flex-col rounded-xl border border-base-600/70 bg-base-850 shadow-pop backdrop-blur-xl animate-sheet-in"
                : "fixed z-[75] flex max-h-[26rem] w-80 flex-col rounded-xl border border-base-600/70 bg-base-850 shadow-pop backdrop-blur-xl animate-slide-in-right"
            }
          >
            <div className="flex items-center justify-between border-b border-base-700/40 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <ProviderFavicon provider="puter" size={13} />
                <span className="text-sm font-medium text-slate-200">Puter.js models</span>
              </div>
              <button type="button" aria-label="Close Puter.js models" onClick={() => setPuterBrowseOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

            <div className="px-2 pt-2">
              <input
                autoFocus
                type="search"
                aria-label="Search Puter.js models"
                value={puterSearch}
                onChange={(e) => setPuterSearch(e.target.value)}
                placeholder="Search 800+ models…"
                className="w-full rounded-md border border-base-600/60 bg-base-900/60 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={catalogLoading}>
              {catalogLoading && (
                <p className="flex items-center gap-1.5 px-0.5 py-2 text-xs text-slate-500" role="status">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Loading Puter's model catalog…
                </p>
              )}
              {catalogError && (
                <p className="px-0.5 py-2 text-xs text-red-400" role="alert">Couldn't load Puter's model list. Try reopening this panel.</p>
              )}
              {!catalogLoading &&
                !catalogError &&
                matchingCatalog.map((info) => {
                  const starred = isPuterFavorited(info.id);
                  const def = puterInfoToModelDef(info);
                  return (
                    <div key={info.id} className="flex items-center rounded-md hover:bg-base-700/50">
                      <button
                        type="button"
                        onClick={() => selectModel(def, closeMenuRef.current)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm text-slate-300"
                      >
                        <ModelFavicon provider="puter" modelId={info.id} size={14} />
                        <span className="min-w-0 flex-1 truncate">{info.name || info.id}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePuterFavorite(def)}
                        aria-pressed={starred}
                        aria-label={starred ? `Unstar ${def.displayName}` : `Star ${def.displayName} to pin under Puter.js`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center ${starred ? "text-amber-400" : "text-slate-600 hover:text-slate-400"}`}
                      >
                        <Star size={13} fill={starred ? "currentColor" : "none"} />
                      </button>
                    </div>
                  );
                })}
              {!catalogLoading && !catalogError && matchingCatalog.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-500">No matches.</p>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

    {pendingPuterModel && (
      <PuterNoticeModal
        modelName={pendingPuterModel.displayName}
        onCancel={() => setPendingPuterModel(null)}
        onConfirm={() => {
          const favorites = currentPuterFavorites();
          if (!favorites.some((f) => f.modelId === pendingPuterModel.modelId)) {
            updateSettings({ puterFavoriteModels: [...favorites, pendingPuterModel] });
          }
          onChange(pendingPuterModel);
          setPendingPuterModel(null);
        }}
      />
    )}
    </>
  );
}
