import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, Eye, Video, Code2, Brain, Type, Zap, Lock, ArrowUp, ChevronDown } from "lucide-react";
import { getAllModels, PROVIDER_LABELS, isModelGated } from "../config/models";
import { getModelDescription } from "../config/modelDocs";
import { ModelFavicon } from "../components/ProviderIcon";
import { AdUnit } from "../components/AdUnit";
import { LogoMark } from "../components/Logo";
import { docsPath } from "../lib/router";
import type { ModelCapability, ModelDef } from "../types";

/**
 * Docs section: one big file, every model rendered from the same ALL_MODELS +
 * modelDocs.ts data (see ADD_NEW_MODEL.md) rather than a hand-authored page
 * per model. Two views live here — the index (slug === "") and a single
 * model's page (slug === that model's slug) — chosen by the caller (App.tsx)
 * based on the current URL, matching the "/c/{id}" pattern in lib/router.ts.
 */

/**
 * Real AdSense ad-unit slot ids (client ca-pub-3625273606687332 — see AdUnit.tsx).
 * Each id below must come from an ad unit created in the AdSense dashboard
 * (Ads → By ad unit → Display ads); a slot id can't be invented, it has to be
 * copied from there. Swap every "REPLACE_ME_*" for a real slot id — until then
 * those units render as unfilled/blank space, same as any other new ad unit.
 *
 * The rails intentionally hold more than 2 ids each: they're laid out in normal
 * document flow (not sticky), so as the page scrolls each ad scrolls away and
 * the next one in the array takes its place — different creative, not the same
 * unit following the reader down the page.
 */
const AD_SLOTS = {
  top: "REPLACE_ME_TOP",
  left: ["REPLACE_ME_LEFT_1", "REPLACE_ME_LEFT_2", "REPLACE_ME_LEFT_3"],
  right: ["REPLACE_ME_RIGHT_1", "REPLACE_ME_RIGHT_2", "REPLACE_ME_RIGHT_3"],
};

/** Bump this whenever a model is added/removed/re-described — shown on the index
 * page so readers know how fresh the catalog is. */
const CATALOG_LAST_UPDATED = "August 2026";

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Do I need an account to use these models?",
    answer:
      "No. Most models here are free and open the moment you pick them. A few — marked with a lock icon — need a sign-in, usually because the provider requires it or the model costs real money to run.",
  },
  {
    question: "Is my chat data used to train anything?",
    answer:
      "Scribble doesn't train models. Messages are sent straight to the provider you picked, under that provider's own terms — see the model's page for which one that is.",
  },
  {
    question: "Why does context length vary so much between models?",
    answer:
      "It's set by whoever built the model, not by Scribble. Longer context means the model can hold more of a conversation or document in memory at once, but it also tends to cost more and run slower.",
  },
  {
    question: "Can I add a model that isn't listed here?",
    answer:
      "Yes — any OpenAI-compatible endpoint can be added from Settings → Custom Models. It'll show up in the model picker but won't get a docs page here since Scribble has no way to verify what it actually does.",
  },
];

function FaqItem({ item }: { item: (typeof FAQ_ITEMS)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-base-700/50 py-3 first:pt-0 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-slate-200 hover:text-white"
      >
        {item.question}
        <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.answer}</p>}
    </div>
  );
}

function FaqSection() {
  return (
    <section className="mt-10 rounded-xl border border-base-700/60 bg-base-900/40 p-4 sm:p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Frequently asked</h2>
      <div>
        {FAQ_ITEMS.map((item) => (
          <FaqItem key={item.question} item={item} />
        ))}
      </div>
    </section>
  );
}

/** Floating scroll-to-top button, shown once the reader is far enough down a docs
 * page for it to be worth the tap — these pages (especially the catalog) can run long. */
function BackToTop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back to top"
      className={`fixed bottom-6 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-base-600/60 bg-base-800/90 text-slate-300 shadow-panel backdrop-blur transition-all hover:border-accent-500/50 hover:text-white sm:right-6 ${
        visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp size={16} />
    </button>
  );
}

export function modelSlug(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[/:._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const CAPABILITY_META: Record<ModelCapability, { label: string; icon: typeof Eye }> = {
  text: { label: "Text", icon: Type },
  vision: { label: "Vision", icon: Eye },
  video: { label: "Video", icon: Video },
  code: { label: "Code", icon: Code2 },
  reasoning: { label: "Reasoning", icon: Brain },
};

function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const meta = CAPABILITY_META[capability];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-base-600/60 bg-base-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-300">
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function DocsHeader({ onExit }: { onExit: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-base-700/60 px-4 py-3 sm:px-6">
      <button onClick={onExit} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
          <LogoMark size={13} className="text-base-950" />
        </div>
        <span className="font-serif text-base font-semibold tracking-tight text-white">Scribble Docs</span>
      </button>
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-accent-500/50 hover:text-white"
      >
        <ArrowLeft size={13} />
        Back to app
      </button>
    </header>
  );
}

function ModelCard({ model, onOpen }: { model: ModelDef; onOpen: (slug: string) => void }) {
  const slug = modelSlug(model.modelId);
  const gated = isModelGated(model);
  return (
    <button
      onClick={() => onOpen(slug)}
      className="flex flex-col gap-2 rounded-xl border border-base-700/60 bg-base-900/40 p-4 text-left transition-colors hover:border-accent-500/50 hover:bg-base-800/50"
    >
      <div className="flex items-center gap-2">
        <ModelFavicon model={model} size={18} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{model.displayName}</span>
        {gated ? <Lock size={12} className="shrink-0 text-slate-500" /> : <Zap size={12} className="shrink-0 text-accent-400" />}
      </div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{PROVIDER_LABELS[model.provider]}</p>
      <p className="line-clamp-2 text-xs text-slate-400">{getModelDescription(model.modelId, model.capabilities)}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {model.capabilities.map((c) => (
          <CapabilityBadge key={c} capability={c} />
        ))}
      </div>
    </button>
  );
}

function DocsIndex({ onOpen }: { onOpen: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const models = getAllModels();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? models.filter((m) => m.displayName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q))
    : models;

  const grouped = useMemo(() => {
    const map = new Map<string, ModelDef[]>();
    for (const m of filtered) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold text-white sm:text-3xl">Model catalog</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Every model available in Scribble, what it's good at, and its capabilities — vision, code, reasoning, and more.
      </p>
      <p className="mt-1 text-xs text-slate-600">Catalog last updated {CATALOG_LAST_UPDATED}</p>

      <div className="relative mt-5 max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models..."
          className="w-full rounded-lg border border-base-600/60 bg-base-900/60 py-2 pl-8 pr-3 text-sm text-slate-200 outline-none placeholder-slate-500 focus:border-accent-500/50"
        />
      </div>

      {[...grouped.entries()].map(([provider, list]) => (
        <section key={provider} className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {PROVIDER_LABELS[provider as ModelDef["provider"]]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((m) => (
              <ModelCard key={m.modelId} model={m} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">No models match "{query}"</p>}

      <FaqSection />
    </div>
  );
}

function ModelPage({ model, onOpen, onBackToIndex }: { model: ModelDef; onOpen: (slug: string) => void; onBackToIndex: () => void }) {
  const gated = isModelGated(model);
  const description = getModelDescription(model.modelId, model.capabilities);
  const related = getAllModels()
    .filter((m) => m.provider === model.provider && m.modelId !== model.modelId)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button onClick={onBackToIndex} className="mb-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        <ArrowLeft size={13} />
        All models
      </button>

      <div className="flex items-start gap-3">
        <ModelFavicon model={model} size={36} />
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold text-white sm:text-3xl">{model.displayName}</h1>
          <p className="text-sm text-slate-500">{PROVIDER_LABELS[model.provider]}</p>
        </div>
      </div>

      <p className="mt-4 text-base leading-relaxed text-slate-300">{description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {model.capabilities.map((c) => (
          <CapabilityBadge key={c} capability={c} />
        ))}
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            gated ? "border-base-600/60 bg-base-800/60 text-slate-400" : "border-accent-500/40 bg-accent-500/10 text-accent-400"
          }`}
        >
          {gated ? <Lock size={11} /> : <Zap size={11} />}
          {gated ? "Sign in required" : "Free, no sign-in"}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-base-700/60 bg-base-900/40 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Context length</dt>
          <dd className="mt-0.5 text-slate-200">{model.contextLength.toLocaleString()} tokens</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Streaming</dt>
          <dd className="mt-0.5 text-slate-200">{model.supportsStreaming ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Model ID</dt>
          <dd className="mt-0.5 truncate text-slate-200" title={model.modelId}>
            {model.modelId}
          </dd>
        </div>
      </dl>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            More from {PROVIDER_LABELS[model.provider]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {related.map((m) => (
              <ModelCard key={m.modelId} model={m} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** A side rail of ad units in normal document flow — deliberately NOT sticky, so each
 * one scrolls away with the page instead of chasing the reader down it. Spaced apart
 * with a big gap so there's a clear stretch of empty rail (the "cutoff") before the
 * next, different, ad unit scrolls into view. Below `lg` there's no room beside the
 * content, so the rail drops under it instead, still stacked vertically. */
function AdRail({ slots, order }: { slots: string[]; order: string }) {
  return (
    <aside className={`flex shrink-0 flex-col items-center gap-32 lg:w-[160px] ${order}`}>
      {slots.map((slot) => (
        <AdUnit key={slot} slot={slot} width={160} height={300} />
      ))}
    </aside>
  );
}

function NotFound({ onBackToIndex }: { onBackToIndex: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-sm text-slate-400">No model matches this page.</p>
      <button
        onClick={onBackToIndex}
        className="mt-4 rounded-lg border border-base-600/60 bg-base-800/60 px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent-500/50 hover:text-white"
      >
        Browse all models
      </button>
    </div>
  );
}

export function DocsPage({ slug, onExit }: { slug: string; onExit: () => void }) {
  const navigate = (target: string) => {
    window.history.pushState(null, "", docsPath(target));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const backToIndex = () => navigate("");

  const model = slug ? getAllModels().find((m) => modelSlug(m.modelId) === slug) : undefined;

  useEffect(() => {
    document.title = model ? `${model.displayName} — Scribble Docs` : "Model catalog — Scribble Docs";
  }, [model]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollPct(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };
  // New page (index <-> a model) starts scrolled to top with a reset progress bar.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollPct(0);
  }, [slug]);

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <div className="fixed inset-x-0 top-0 z-20 h-[2px] bg-base-800/60">
        <div className="h-full bg-accent-500 transition-[width]" style={{ width: `${scrollPct * 100}%` }} />
      </div>
      <DocsHeader onExit={onExit} />

      <div className="flex justify-center border-b border-base-700/40 bg-base-900/20 px-4 py-4">
        <AdUnit slot={AD_SLOTS.top} width={728} height={90} className="w-full" />
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:px-8">
        <AdRail slots={AD_SLOTS.left} order="order-2 lg:order-1" />
        <div className="min-w-0 flex-1 order-1 lg:order-2">
          {!slug && <DocsIndex onOpen={navigate} />}
          {slug && model && <ModelPage model={model} onOpen={navigate} onBackToIndex={backToIndex} />}
          {slug && !model && <NotFound onBackToIndex={backToIndex} />}
        </div>
        <AdRail slots={AD_SLOTS.right} order="order-3" />
      </div>

      <BackToTop visible={scrollPct > 0.15} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
    </div>
  );
}
