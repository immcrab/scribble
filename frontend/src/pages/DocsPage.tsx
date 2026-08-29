import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Search,
  Eye,
  Video,
  Code2,
  Brain,
  Type,
  Zap,
  Lock,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Server,
  BookOpen,
  Terminal,
  Layers,
  Trophy,
  Medal,
} from "lucide-react";
import { getAllModels, PROVIDER_LABELS, isModelGated, catalogSizeLabel } from "../config/models";
import { getModelDescription } from "../config/modelDocs";
import { ModelFavicon, ProviderFavicon } from "../components/ProviderIcon";
import { AdUnit } from "../components/AdUnit";
import { LogoMark } from "../components/Logo";
import { docsPath } from "../lib/router";
import { modelSlug } from "../lib/modelSlug";
import { monthKey, fetchMonthStats, type MonthStats } from "../lib/modelStats";
import type { ModelCapability, ModelDef, Provider } from "../types";

/**
 * Docs section: one big file, every model rendered from the same ALL_MODELS +
 * modelDocs.ts data (see ADD_NEW_MODEL.md) rather than a hand-authored page
 * per model. Views live here — the homepage (slug === ""), the model catalog
 * (slug === "models"), the provider list (slug === "providers"), the monthly
 * usage leaderboard (slug === "top-models"), a single model's page (slug ===
 * that model's slug), and the Worker deploy guide (slug === "worker") —
 * chosen by the caller (App.tsx) based on the current URL, matching the
 * "/c/{id}" pattern in lib/router.ts. Reserved slugs ("models", "providers",
 * "top-models", "worker") shadow any model whose generated slug happened to
 * collide, so keep new sections' slugs out of modelSlug()'s output space
 * (see ADD_NEW_MODEL.md) if that's ever a risk.
 */

/**
 * Real AdSense ad-unit slot ids (client ca-pub-3679522337620689 — see AdUnit.tsx).
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
 * page so readers know how fresh the catalog is. The catalog size shown around
 * the docs is `catalogSizeLabel()` (rounded down to a "N+"); when it crosses the
 * next multiple of 10, also bump the static "N+ models" copy in
 * frontend/index.html's <meta> tags — see ADD_NEW_MODEL.md. */
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

const DOCS_NAV = [
  { slug: "", label: "Home" },
  { slug: "models", label: "Models" },
  { slug: "providers", label: "Providers" },
  { slug: "top-models", label: "Top models" },
  { slug: "worker", label: "Deploy a Worker" },
] as const;

function DocsHeader({ slug, onNavigate, onExit }: { slug: string; onNavigate: (slug: string) => void; onExit: () => void }) {
  // Model pages don't match any nav slug, but they're logically under "Models" —
  // highlight that tab rather than none.
  const isModelPage = slug !== "" && !DOCS_NAV.some((n) => n.slug === slug);
  return (
    <header className="flex flex-col gap-2 border-b border-base-700/60 px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => onNavigate("")} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
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
      </div>
      <nav className="flex flex-wrap items-center gap-1">
        {DOCS_NAV.map((item) => {
          const active = item.slug === slug || (item.slug === "models" && isModelPage);
          return (
            <button
              key={item.slug || "home"}
              onClick={() => onNavigate(item.slug)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "bg-accent-500/15 text-accent-400" : "text-slate-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
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

/** Copy-to-clipboard shell command block, used throughout the Worker deploy guide. */
function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative mt-2 rounded-lg border border-base-700/60 bg-base-950/60">
      <button
        onClick={copy}
        aria-label="Copy command"
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-base-600/60 bg-base-800/80 px-1.5 py-1 text-[10px] text-slate-400 hover:text-white"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
      <pre className="overflow-x-auto p-3 pr-14 text-xs leading-relaxed text-slate-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function GuideStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-base-700/50 py-5 first:pt-0 last:border-b-0">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-800 text-xs font-semibold text-accent-400">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</div>
      </div>
    </div>
  );
}

function WorkerGuidePage({ onOpen }: { onOpen: (slug: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <Server size={20} className="text-accent-400" />
        <h1 className="font-serif text-2xl font-semibold text-white sm:text-3xl">Deploy your own Worker</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Scribble's frontend is static — it never talks to a model provider directly. Every chat request goes through a
        small Cloudflare Worker (<code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">worker/</code>{" "}
        in the repo) that holds your API keys and normalizes each provider into the same streaming format. Deploying
        your own Worker means your keys stay yours, and you control which providers are enabled.
      </p>

      <section className="mt-8 rounded-xl border border-base-700/60 bg-base-900/40 p-4 sm:p-5">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">What you'll need</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-600" />A free Cloudflare account
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-600" />
            Node.js installed locally
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-600" />
            An API key from at least one provider (xKiro, Mistral, Gemini, or OpenRouter)
          </li>
          <li className="flex items-start gap-2">
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-600" />A clone of the Scribble repo
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Step by step</h2>

        <GuideStep n={1} title="Install dependencies">
          <p>From the repo root, install the Worker's dependencies.</p>
          <CodeBlock>{"cd worker\nnpm install"}</CodeBlock>
        </GuideStep>

        <GuideStep n={2} title="Log in to Cloudflare">
          <p>Wrangler (Cloudflare's CLI) will open a browser tab to authenticate.</p>
          <CodeBlock>npx wrangler login</CodeBlock>
        </GuideStep>

        <GuideStep n={3} title="Allow your frontend's origin">
          <p>
            Open <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">worker/wrangler.toml</code> and
            edit <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">ALLOWED_ORIGINS</code> under{" "}
            <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">[vars]</code> to a comma-separated
            list including wherever your copy of the frontend is hosted (GitHub Pages, a custom domain, etc). Requests
            from origins not on this list are rejected by CORS.
          </p>
        </GuideStep>

        <GuideStep n={4} title="Add your provider API key(s)">
          <p>
            Each provider's key is a Worker secret, never committed to the repo. Set one for every provider you want
            enabled — you only need one to get started:
          </p>
          <CodeBlock>
            {[
              "npx wrangler secret put XKIRO_API_KEY",
              "npx wrangler secret put MISTRAL_API_KEY",
              "npx wrangler secret put GEMINI_API_KEY",
              "npx wrangler secret put OPENROUTER_API_KEY",
            ].join("\n")}
          </CodeBlock>
          <p className="mt-2">
            Each command prompts for the key's value, then stores it encrypted — it's never written to disk or to
            wrangler.toml. One more secret, <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">GROQ_API_KEY</code>,
            isn't tied to a selectable model — it only powers automatic chat-title generation and is optional (chats
            fall back to a truncated-prompt title without it).
          </p>
        </GuideStep>

        <GuideStep n={5} title="(Optional) Lock it down with a password">
          <p>
            Without this, anyone who has your Worker's URL can use it — and burn your API budget. Set{" "}
            <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">SCRIBBLE_PASSWORD</code> to require
            a password from the frontend's Settings panel before the Worker will respond.
          </p>
          <CodeBlock>npx wrangler secret put SCRIBBLE_PASSWORD</CodeBlock>
        </GuideStep>

        <GuideStep n={6} title="(Optional) Enable image generation">
          <p>
            Image mode has two backends, picked from the selector in its header. The default,{" "}
            <strong className="text-slate-300">Cloudflare Flux</strong>, uses Cloudflare Workers AI directly and needs two
            secrets: your Cloudflare account ID and a Workers AI-scoped API token (create one under My Profile → API
            Tokens in the Cloudflare dashboard).
          </p>
          <CodeBlock>{"npx wrangler secret put CF_ACCOUNT_ID\nnpx wrangler secret put CF_AI_TOKEN"}</CodeBlock>
          <p>
            <strong className="text-slate-300">GPT Image</strong> (served via xKiro) reuses the same{" "}
            <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">XKIRO_API_KEY</code> as chat — no
            extra secret. Set either backend, or both. GPT Image can also{" "}
            <strong className="text-slate-300">edit</strong> a picture — attach an image in Image mode (or hit{" "}
            <span className="whitespace-nowrap">"Edit"</span> on one you already made) and describe the change.
          </p>
          <p className="mt-2">
            <strong className="text-slate-300">Text to Speech</strong> mode also runs on{" "}
            <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">XKIRO_API_KEY</code> — pick from
            xKiro's 148 voices, adjust speed and format, then play or download the audio. No extra secret needed.
          </p>
        </GuideStep>

        <GuideStep n={7} title="Deploy">
          <p>This publishes the Worker to a *.workers.dev URL and prints it at the end.</p>
          <CodeBlock>npm run deploy</CodeBlock>
        </GuideStep>

        <GuideStep n={8} title="Point Scribble at it">
          <p>
            Back in the app, open <strong className="text-slate-300">Settings → Worker URL</strong> and paste the URL
            from the previous step. If you set a password in step 5, enter it in{" "}
            <strong className="text-slate-300">Access password</strong> too. Settings has a test-connection check that
            pings the Worker's <code className="rounded bg-base-800 px-1 py-0.5 text-xs text-slate-300">/api/health</code>{" "}
            endpoint — use it to confirm the Worker is reachable before sending your first chat.
          </p>
        </GuideStep>
      </section>

      <section className="mt-8 rounded-xl border border-base-700/60 bg-base-900/40 p-4 sm:p-5">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Troubleshooting</h2>
        <div className="mt-2 space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-200">CORS error in the browser console</p>
            <p className="mt-0.5 text-slate-400">
              The frontend's origin isn't in <code className="rounded bg-base-800 px-1 py-0.5 text-xs">ALLOWED_ORIGINS</code>
              . Add it in wrangler.toml and redeploy.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">"is not configured on this Worker (missing API key secret)"</p>
            <p className="mt-0.5 text-slate-400">
              The model you picked belongs to a provider whose secret isn't set yet — run the matching{" "}
              <code className="rounded bg-base-800 px-1 py-0.5 text-xs">wrangler secret put</code> command from step 4.
            </p>
          </div>
          <div>
            <p className="font-medium text-slate-200">"Invalid or missing Scribble password"</p>
            <p className="mt-0.5 text-slate-400">
              The Worker has <code className="rounded bg-base-800 px-1 py-0.5 text-xs">SCRIBBLE_PASSWORD</code> set, and
              Scribble's Settings either has no password or the wrong one.
            </p>
          </div>
        </div>
      </section>

      <button
        onClick={() => onOpen("models")}
        className="mt-8 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
      >
        Browse the model catalog
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

function HomeCard({
  onClick,
  icon,
  eyebrow,
  title,
  description,
  cta,
}: {
  onClick: () => void;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  cta: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-2 rounded-xl border border-base-700/60 bg-base-900/40 p-5 text-left transition-colors hover:border-accent-500/50 hover:bg-base-800/50"
    >
      <div className="flex items-center gap-2 text-accent-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{eyebrow}</span>
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-400">{description}</p>
      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-400 group-hover:gap-1.5">
        {cta} <ChevronRight size={13} />
      </span>
    </button>
  );
}

function HomePage({ onOpen }: { onOpen: (slug: string) => void }) {
  const modelCount = getAllModels().length;
  const providerCount = new Set(getAllModels().map((m) => m.provider)).size;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Scribble Docs</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
        Scribble is a free, open chat frontend that talks to your choice of model provider through a Cloudflare Worker
        you control — {catalogSizeLabel()} free models across {providerCount} providers. These docs cover what's
        available and how to run your own Worker behind it.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HomeCard
          onClick={() => onOpen("models")}
          icon={<BookOpen size={18} />}
          eyebrow="Reference"
          title="Model catalog"
          description={`Every one of the ${modelCount} models Scribble supports — capabilities, context length, and whether it needs sign-in.`}
          cta="Browse models"
        />
        <HomeCard
          onClick={() => onOpen("providers")}
          icon={<Layers size={18} />}
          eyebrow="Reference"
          title="Providers"
          description={`The ${providerCount} providers behind those models — what each one is and how Scribble talks to it.`}
          cta="Browse providers"
        />
        <HomeCard
          onClick={() => onOpen("top-models")}
          icon={<Trophy size={18} />}
          eyebrow="Live data"
          title="Top models"
          description="Which model is finishing the most replies this month, tallied anonymously across every Scribble user."
          cta="See the leaderboard"
        />
        <HomeCard
          onClick={() => onOpen("worker")}
          icon={<Terminal size={18} />}
          eyebrow="Guide"
          title="Deploy your own Worker"
          description="Step-by-step setup for the Cloudflare Worker that holds your API keys and proxies chat requests to providers."
          cta="Start deploying"
        />
      </div>

      <FaqSection />
    </div>
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
        All {catalogSizeLabel()} models available in Scribble, what each is good at, and its capabilities — vision,
        code, reasoning, and more.
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
    </div>
  );
}

/** What each provider actually is, in Scribble's own terms — grounded in how
 * lib/workerClient.ts, lib/puterClient.ts, and worker/src/index.ts treat it, not
 * marketing copy. Every entry in the Provider union (types.ts) needs one here. */
const PROVIDERS_META: Record<Provider, { description: string; link?: { href: string; label: string } }> = {
  xkiro: {
    description:
      "Scribble's own provider tier. It's home to the app's default model — the only one that works with no sign-in and no Worker configuration.",
  },
  mistral: {
    description: "Mistral AI's own hosted models, called directly through Mistral's API.",
    link: { href: "https://mistral.ai", label: "mistral.ai" },
  },
  gemini: {
    description: "Google's Gemini model family, called directly through Google's Generative Language API.",
    link: { href: "https://ai.google.dev", label: "ai.google.dev" },
  },
  openrouter: {
    description:
      "A gateway that proxies many upstream model providers behind one API — how Scribble reaches models it has no direct integration for.",
    link: { href: "https://openrouter.ai", label: "openrouter.ai" },
  },
  puter: {
    description:
      "Puter.js, an in-browser AI SDK. Requests go straight from your browser to Puter with its own sign-in and billing — they never touch Scribble's Worker or its provider keys.",
    link: { href: "https://js.puter.com", label: "js.puter.com" },
  },
  custom: {
    description:
      "Any OpenAI-compatible endpoint you add yourself from Settings → Custom Models. Not covered by these docs since Scribble has no way to verify what a custom endpoint actually runs.",
  },
};

function ProviderSection({ provider, models }: { provider: Provider; models: ModelDef[] }) {
  const meta = PROVIDERS_META[provider];
  const gatedCount = models.filter((m) => isModelGated(m)).length;
  return (
    <section className="rounded-xl border border-base-700/60 bg-base-900/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ProviderFavicon provider={provider} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-base font-semibold text-white">{PROVIDER_LABELS[provider]}</h2>
            <span className="text-xs text-slate-500">
              {models.length} model{models.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{meta.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {gatedCount < models.length && (
              <span className="inline-flex items-center gap-1 text-accent-400">
                <Zap size={11} />
                {models.length - gatedCount} free, no sign-in
              </span>
            )}
            {gatedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Lock size={11} />
                {gatedCount} need sign-in
              </span>
            )}
            {meta.link && (
              <a
                href={meta.link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-slate-400 underline decoration-base-600 underline-offset-2 hover:text-white"
              >
                {meta.link.label}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProvidersPage({ onOpen }: { onOpen: (slug: string) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<Provider, ModelDef[]>();
    for (const m of getAllModels()) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return map;
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <Layers size={20} className="text-accent-400" />
        <h1 className="font-serif text-2xl font-semibold text-white sm:text-3xl">Providers</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Every model in Scribble belongs to one of these providers — what actually runs the model, and how Scribble
        talks to it under the hood.
      </p>

      <div className="mt-6 space-y-3">
        {[...grouped.entries()].map(([provider, models]) => (
          <ProviderSection key={provider} provider={provider} models={models} />
        ))}
      </div>

      <button onClick={() => onOpen("models")} className="mt-8 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        Browse the model catalog
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

/** "2026-08" -> "August 2026". monthKey() always produces a valid "YYYY-MM", so the
 * Date it builds (day 2, to dodge UTC-vs-local rollover at the month boundary) is
 * never invalid — no fallback string needed. */
function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 2).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

interface LeaderboardRow {
  model: ModelDef;
  count: number;
}

function TopModelsPage({ onOpen }: { onOpen: (slug: string) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const month = monthKey();

  useEffect(() => {
    let cancelled = false;
    fetchMonthStats(month).then((stats) => {
      if (cancelled) return;
      if (!stats) {
        setState("unavailable");
        return;
      }
      const allModels = getAllModels();
      const bySlug = new Map(allModels.map((m) => [modelSlug(m.modelId), m]));
      const resolved = Object.entries(stats)
        .map(([slug, count]) => ({ model: bySlug.get(slug), count }))
        .filter((r): r is LeaderboardRow => !!r.model)
        .sort((a, b) => b.count - a.count);
      setRows(resolved);
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const top = rows[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-accent-400" />
        <h1 className="font-serif text-2xl font-semibold text-white sm:text-3xl">Top models</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Which model is finishing the most replies across every Scribble user this month — tallied anonymously, with no
        account or chat content attached to a single count. Custom endpoints aren't included since they're per-user.
      </p>
      <p className="mt-1 text-xs text-slate-600">{formatMonthLabel(month)}</p>

      {state === "loading" && <p className="mt-10 text-center text-sm text-slate-500">Loading this month's counts…</p>}

      {state === "unavailable" && (
        <p className="mt-10 text-center text-sm text-slate-500">
          Couldn't reach the leaderboard right now — it needs a connection to Scribble's usage database. Try again in a
          moment.
        </p>
      )}

      {state === "ready" && rows.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">
          No completed replies logged yet for {formatMonthLabel(month)} — check back once some chats have run.
        </p>
      )}

      {state === "ready" && top && (
        <section className="mt-6 rounded-xl border border-accent-500/30 bg-accent-500/5 p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-400">
            <Medal size={13} />
            Top model this month
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ModelFavicon model={top.model} size={28} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white">{top.model.displayName}</p>
              <p className="text-xs text-slate-500">{PROVIDER_LABELS[top.model.provider]}</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {top.count.toLocaleString()} completed {top.count === 1 ? "reply" : "replies"} so far.
          </p>
        </section>
      )}

      {state === "ready" && rows.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Full leaderboard</h2>
          <div className="divide-y divide-base-700/50 rounded-xl border border-base-700/60 bg-base-900/40">
            {rows.map((row, i) => (
              <button
                key={row.model.modelId}
                onClick={() => onOpen(modelSlug(row.model.modelId))}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-base-800/50"
              >
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-500">{i + 1}</span>
                <ModelFavicon model={row.model} size={18} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{row.model.displayName}</span>
                <span className="shrink-0 text-xs text-slate-500">{row.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button onClick={() => onOpen("models")} className="mt-8 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
        Browse the model catalog
        <ChevronRight size={13} />
      </button>
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
  const backToIndex = () => navigate("models");

  const RESERVED_SLUGS = ["", "models", "providers", "top-models", "worker"];
  const isReserved = RESERVED_SLUGS.includes(slug);
  const model = !isReserved ? getAllModels().find((m) => modelSlug(m.modelId) === slug) : undefined;

  useEffect(() => {
    const RESERVED_TITLES: Record<string, string> = {
      "": "Scribble Docs",
      models: "Model catalog — Scribble Docs",
      providers: "Providers — Scribble Docs",
      "top-models": "Top models — Scribble Docs",
      worker: "Deploy your own Worker — Scribble Docs",
    };
    document.title = model ? `${model.displayName} — Scribble Docs` : (RESERVED_TITLES[slug] ?? "Scribble Docs");
  }, [model, slug]);

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
      <DocsHeader slug={slug} onNavigate={navigate} onExit={onExit} />

      <div className="flex justify-center border-b border-base-700/40 bg-base-900/20 px-4 py-4">
        <AdUnit slot={AD_SLOTS.top} width={728} height={90} className="w-full" />
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:px-8">
        <AdRail slots={AD_SLOTS.left} order="order-2 lg:order-1" />
        <div className="min-w-0 flex-1 order-1 lg:order-2">
          {slug === "" && <HomePage onOpen={navigate} />}
          {slug === "models" && <DocsIndex onOpen={navigate} />}
          {slug === "providers" && <ProvidersPage onOpen={navigate} />}
          {slug === "top-models" && <TopModelsPage onOpen={navigate} />}
          {slug === "worker" && <WorkerGuidePage onOpen={navigate} />}
          {!isReserved && model && <ModelPage model={model} onOpen={navigate} onBackToIndex={backToIndex} />}
          {!isReserved && !model && <NotFound onBackToIndex={backToIndex} />}
        </div>
        <AdRail slots={AD_SLOTS.right} order="order-3" />
      </div>

      <BackToTop visible={scrollPct > 0.15} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
    </div>
  );
}
