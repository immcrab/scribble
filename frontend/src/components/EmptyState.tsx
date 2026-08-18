import { Layout, BarChart3, Gamepad2, Code2, Store } from "lucide-react";

const SUGGESTIONS = [
  { icon: Layout, label: "Create a landing page", desc: "Sleek, modern landing page copy", prompt: "Write compelling landing page copy for a startup that builds developer tools." },
  { icon: BarChart3, label: "Build a dashboard", desc: "Turn data into a plan", prompt: "Help me design a dashboard layout for tracking weekly sales metrics." },
  { icon: Gamepad2, label: "Make a game", desc: "Brainstorm a browser game", prompt: "Pitch me three simple browser game ideas I could build in a weekend." },
  { icon: Code2, label: "Explain some code", desc: "Paste code, get a walkthrough", prompt: "Explain what this function does and suggest improvements:\n\n" },
  { icon: Store, label: "Launch a storefront", desc: "Plan an online shop", prompt: "Outline the steps to launch a small online storefront selling handmade goods." },
];

export function EmptyState({ heading, onPick }: { heading?: string; onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-8 font-serif text-4xl font-medium tracking-tight text-slate-100 sm:text-[2.6rem]">
        {heading ?? "What would you like to do?"}
      </h1>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
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
