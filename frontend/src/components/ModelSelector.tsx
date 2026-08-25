import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Eye, Check, Sparkles, Star, Lock, TriangleAlert, Loader2, X } from "lucide-react";
import type { ModelDef, Provider } from "../types";
import { modelsByProvider, PROVIDER_LABELS, isModelGated } from "../config/models";
import { ModelFavicon, ProviderFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { PuterNoticeModal } from "./PuterNoticeModal";
import { useAuthStore } from "../state/authStore";
import { useChatStore } from "../state/chatStore";
import { isPuterSignedIn, listPuterModels, type PuterModelInfo } from "../lib/puterClient";

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

/** One row shared by both the curated provider lists and the Puter favorites list, so
 * starring a Puter model doesn't visually diverge from the rest of the menu. `endAdornment`
 * (used for the star toggle) renders just before the lock/check indicator. */
function ModelRow({
  model,
  active,
  locked,
  onSelect,
  endAdornment,
}: {
  model: ModelDef;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
  endAdornment?: ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
        active ? "bg-accent-500/10 text-white font-medium" : "text-slate-300"
      }`}
    >
      <ModelFavicon model={model} size={15} />
      <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
      {model.knownBroken && (
        <span
          title={model.knownBroken}
          className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400 shrink-0"
        >
          <TriangleAlert size={10} strokeWidth={2.5} />
          <span>Down</span>
        </span>
      )}
      {model.supportsVision && (
        <span
          title="Supports image and vision input"
          className="hidden sm:inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-400 shrink-0"
        >
          <Eye size={10} strokeWidth={2.5} />
          <span>Vision</span>
        </span>
      )}
      {endAdornment}
      {locked ? (
        <span title="Sign in to unlock">
          <Lock size={12} className="shrink-0 text-slate-500" />
        </span>
      ) : (
        active && <Check size={13} className="shrink-0 text-accent-400" />
      )}
    </button>
  );
}

const MOBILE_BREAKPOINT = 640; // matches Tailwind's `sm` — below this, the flyout can't fit beside the menu
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
  const grouped = modelsByProvider();
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const puterFavorites = useChatStore((s) => s.settings.puterFavoriteModels);
  const updateSettings = useChatStore((s) => s.updateSettings);
  const [pendingPuterModel, setPendingPuterModel] = useState<ModelDef | null>(null);
  const [puterBrowseOpen, setPuterBrowseOpen] = useState(false);
  const [puterSearch, setPuterSearch] = useState("");
  const [catalog, setCatalog] = useState<PuterModelInfo[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const browseRowRef = useRef<HTMLDivElement>(null);
  // The portal below renders outside <Dropdown>'s render-prop scope, so it can't close
  // over that render's `close` callback directly — stash the latest one here instead.
  const closeMenuRef = useRef<() => void>(() => {});
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  function isFavorited(modelId: string): boolean {
    return puterFavorites.some((m) => m.modelId === modelId);
  }

  // Reads the store fresh rather than closing over the `puterFavorites` render
  // variable — two of these can fire back-to-back (e.g. unstar immediately
  // followed by picking another Puter model) faster than React re-renders,
  // and a stale closure would silently resurrect the model just removed.
  function currentPuterFavorites(): ModelDef[] {
    return useChatStore.getState().settings.puterFavoriteModels;
  }

  function toggleFavorite(model: ModelDef) {
    const favorites = currentPuterFavorites();
    updateSettings({
      puterFavoriteModels: favorites.some((m) => m.modelId === model.modelId)
        ? favorites.filter((m) => m.modelId !== model.modelId)
        : [...favorites, model],
    });
  }

  function selectModel(m: ModelDef, close: () => void) {
    if (isModelGated(m) && !user) {
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
    if (m.provider === "puter" && !isFavorited(m.modelId)) {
      const favorites = currentPuterFavorites();
      if (!favorites.some((f) => f.modelId === m.modelId)) {
        updateSettings({ puterFavoriteModels: [...favorites, m] });
      }
    }
    onChange(m);
    close();
  }

  const providers = (Object.keys(grouped) as Provider[]).filter((p) => p !== "puter");
  // `grouped.puter` includes every puter-provider model from any source — ALL_MODELS,
  // customModels, and puterFavorites. The starred/pinned section must only ever show
  // genuine favorites, sourced straight from settings — selectModel() favorites a Puter
  // model the moment it's picked, so this list IS "every Puter model you've used or
  // starred." Custom Models entries targeting "puter" still get a plain row below it,
  // same as every other provider, just without the star.
  const favoritedPuterModels = puterFavorites;
  const customPuterModels = (grouped.puter ?? []).filter((m) => m.isCustom && !isFavorited(m.modelId));

  return (
    <>
    <Dropdown
      align={align}
      menuClassName="max-h-96 w-80 max-w-[calc(100vw-2rem)]"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex items-center gap-2 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent-500/50 hover:bg-base-700/60"
        >
          <ModelFavicon model={value} size={15} />
          <span className="max-w-[160px] truncate">{value ? value.displayName : "Select model"}</span>
          {value?.knownBroken && (
            <span title={value.knownBroken} className="inline-flex shrink-0 items-center text-amber-400">
              <TriangleAlert size={12} strokeWidth={2.5} />
            </span>
          )}
          {value?.supportsVision && (
            <span
              title="Supports vision input"
              className="hidden sm:inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-sky-400"
            >
              <Eye size={9} strokeWidth={2.5} />
              Vision
            </span>
          )}
          <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => {
        closeMenuRef.current = close;
        return (
        <>
          <CloseOnUnmount onUnmount={() => setPuterBrowseOpen(false)} />
          {providers.map((provider) => (
            <div key={provider} className="py-1.5 border-b border-base-700/40 last:border-b-0">
              <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5">
                <ProviderFavicon provider={provider} size={13} />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {PROVIDER_LABELS[provider]}
                </span>
              </div>
              {grouped[provider].map((m) => (
                <ModelRow
                  key={m.modelId}
                  model={m}
                  active={value?.modelId === m.modelId}
                  locked={isModelGated(m) && !user}
                  onSelect={() => selectModel(m, close)}
                />
              ))}
            </div>
          ))}

          <div className="py-1.5">
            <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5">
              <ProviderFavicon provider="puter" size={13} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Puter.js</span>
            </div>

            {favoritedPuterModels.map((m) => (
              <ModelRow
                key={m.modelId}
                model={m}
                active={value?.modelId === m.modelId}
                locked={isModelGated(m) && !user}
                onSelect={() => selectModel(m, close)}
                endAdornment={
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(m);
                    }}
                    title="Unstar"
                    className="shrink-0 text-amber-400 hover:text-amber-300"
                  >
                    <Star size={13} fill="currentColor" />
                  </span>
                }
              />
            ))}

            {customPuterModels.map((m) => (
              <ModelRow
                key={m.modelId}
                model={m}
                active={value?.modelId === m.modelId}
                locked={isModelGated(m) && !user}
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
                onClick={() => setPuterBrowseOpen((o) => !o)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                  puterBrowseOpen ? "text-slate-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles size={15} className="shrink-0 text-violet-400" />
                <span className="min-w-0 flex-1 truncate">Browse all Puter models</span>
                <ChevronRight size={13} className="shrink-0 text-slate-500" />
              </button>
            </div>
          </div>
        </>
        );
      }}
    </Dropdown>

    {puterBrowseOpen &&
      createPortal(
        <>
          {isMobile && <div className="fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={() => setPuterBrowseOpen(false)} />}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={isMobile ? undefined : { top: flyoutPos?.top ?? 0, left: flyoutPos?.left ?? 0 }}
            className={
              isMobile
                ? "fixed inset-x-3 bottom-3 z-50 flex max-h-[70vh] flex-col rounded-xl border border-base-600/70 bg-base-850/95 shadow-panel backdrop-blur-xl animate-fade-in-up"
                : "fixed z-50 flex max-h-[26rem] w-80 flex-col rounded-xl border border-base-600/70 bg-base-850/95 shadow-panel backdrop-blur-xl animate-fade-in-up"
            }
          >
            <div className="flex items-center justify-between border-b border-base-700/40 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <ProviderFavicon provider="puter" size={13} />
                <span className="text-sm font-medium text-slate-200">Puter.js models</span>
              </div>
              <button onClick={() => setPuterBrowseOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

            <div className="px-2 pt-2">
              <input
                autoFocus
                value={puterSearch}
                onChange={(e) => setPuterSearch(e.target.value)}
                placeholder="Search 800+ models…"
                className="w-full rounded-md border border-base-600/60 bg-base-900/60 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {catalogLoading && (
                <p className="flex items-center gap-1.5 px-0.5 py-2 text-xs text-slate-500">
                  <Loader2 size={12} className="animate-spin" />
                  Loading Puter's model catalog…
                </p>
              )}
              {catalogError && (
                <p className="px-0.5 py-2 text-xs text-red-400">Couldn't load Puter's model list. Try reopening this panel.</p>
              )}
              {!catalogLoading &&
                !catalogError &&
                matchingCatalog.map((info) => {
                  const starred = isFavorited(info.id);
                  return (
                    <button
                      key={info.id}
                      onClick={() => selectModel(puterInfoToModelDef(info), closeMenuRef.current)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-base-700/50"
                    >
                      <ModelFavicon provider="puter" modelId={info.id} size={14} />
                      <span className="min-w-0 flex-1 truncate">{info.name || info.id}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(puterInfoToModelDef(info));
                        }}
                        title={starred ? "Unstar" : "Star to pin under Puter.js"}
                        className={`shrink-0 ${starred ? "text-amber-400" : "text-slate-600 hover:text-slate-400"}`}
                      >
                        <Star size={13} fill={starred ? "currentColor" : "none"} />
                      </span>
                    </button>
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
