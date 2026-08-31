import { Layout, BarChart3, Gamepad2, Code2, Store, Scale, Search, Sparkles, GitCompare, Bot } from "lucide-react";
import type { Mode } from "../types";

type Suggestion = { icon: typeof Layout; label: string; desc: string; prompt: string };

const DIRECT: Suggestion[] = [
  { icon: Layout, label: "Create a landing page", desc: "Sleek, modern landing page copy", prompt: "Write compelling landing page copy for a startup that builds developer tools." },
  { icon: BarChart3, label: "Build a dashboard", desc: "Turn data into a plan", prompt: "Help me design a dashboard layout for tracking weekly sales metrics." },
  { icon: Gamepad2, label: "Make a game", desc: "Brainstorm a browser game", prompt: "Pitch me three simple browser game ideas I could build in a weekend." },
  { icon: Code2, label: "Explain some code", desc: "Paste code, get a walkthrough", prompt: "Explain what this function does and suggest improvements:\n\n" },
  { icon: Store, label: "Launch a storefront", desc: "Plan an online shop", prompt: "Outline the steps to launch a small online storefront selling handmade goods." },
];

const BATTLE: Suggestion[] = [
  { icon: Scale, label: "Settle a debate", desc: "See which model argues it better", prompt: "Argue for and against a four-day work week, then give a verdict." },
  { icon: Code2, label: "Same code task, two models", desc: "Compare how each one solves it", prompt: "Write a debounce function in TypeScript with a leading-edge option, and explain the tradeoffs." },
  { icon: Sparkles, label: "Creative writing", desc: "Judge the more vivid answer", prompt: "Write the opening paragraph of a mystery novel set on a night train." },
  { icon: BarChart3, label: "Explain a hard concept", desc: "Reward the clearer explanation", prompt: "Explain how HTTPS certificate validation works, to a junior developer." },
];

const SIDE_BY_SIDE: Suggestion[] = [
  { icon: GitCompare, label: "Compare approaches", desc: "One prompt, both models at once", prompt: "Design a rate limiter for an API. Cover the algorithm, storage, and edge cases." },
  { icon: Code2, label: "Code review", desc: "Two sets of eyes on the same diff", prompt: "Review this code for bugs and clarity:\n\n" },
  { icon: BarChart3, label: "Draft a plan", desc: "See two takes side by side", prompt: "Draft a two-week onboarding plan for a new backend engineer." },
  { icon: Sparkles, label: "Rewrite this", desc: "Pick the better rewrite", prompt: "Rewrite this paragraph to be tighter and more direct:\n\n" },
];

const AGENT: Suggestion[] = [
  { icon: Search, label: "Research a topic", desc: "It'll search the web as needed", prompt: "Research the current state of small modular nuclear reactors and summarize where the technology stands." },
  { icon: BarChart3, label: "Compare options", desc: "Pull in live details", prompt: "Compare the current pricing and free tiers of the major cloud object-storage services." },
  { icon: Bot, label: "Plan a build", desc: "Break a project into steps", prompt: "Plan the architecture for a link-shortener with analytics. List the components and the order to build them." },
  { icon: Code2, label: "Debug with context", desc: "Paste an error, get a fix", prompt: "Here's an error I'm getting — help me track down the cause:\n\n" },
];

const BY_MODE: Record<string, Suggestion[]> = {
  direct: DIRECT,
  battle: BATTLE,
  "side-by-side": SIDE_BY_SIDE,
  agent: AGENT,
};

export function EmptyState({ heading, mode = "direct", onPick }: { heading?: string; mode?: Mode; onPick: (prompt: string) => void }) {
  const suggestions = BY_MODE[mode] ?? DIRECT;
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-7 px-4 text-center">
      <h1 className="text-balance font-serif text-3xl font-light tracking-tighter text-slate-100 sm:text-[2.6rem]">
        {heading ?? "What would you like to do?"}
      </h1>
      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.prompt)}
            className="flex items-start gap-3 rounded-xl border border-base-700/60 bg-base-850/50 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent-500/50 hover:bg-base-800/70 hover:shadow-glow"
          >
            <s.icon size={17} className="mt-0.5 shrink-0 text-accent-400" />
            <span>
              <span className="block text-sm font-medium text-slate-200">{s.label}</span>
              <span className="block text-xs text-slate-500">{s.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
