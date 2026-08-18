import { useEffect, useRef, useState } from "react";
import { Swords, Bot, Columns2, MessageCircle, ChevronDown } from "lucide-react";
import type { Mode } from "../types";

const MODES: { id: Mode; label: string; desc: string; icon: typeof Swords }[] = [
  { id: "battle", label: "Battle Mode", desc: "Battle 2 anonymous models", icon: Swords },
  { id: "agent", label: "Agent Mode", desc: "Built for complex tasks", icon: Bot },
  { id: "side-by-side", label: "Side by Side", desc: "Compare 2 models of your choice", icon: Columns2 },
  { id: "direct", label: "Direct", desc: "Chat with 1 model at a time", icon: MessageCircle },
];

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-base-600 hover:bg-base-800/70"
      >
        <current.icon size={16} className="text-accent-400" />
        {current.label}
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 origin-top-left animate-fade-in-up overflow-hidden rounded-xl border border-base-600/70 bg-base-850/95 shadow-panel backdrop-blur-xl">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors ${
                m.id === mode ? "bg-accent-500/10" : "hover:bg-base-700/50"
              }`}
            >
              <m.icon size={18} className={m.id === mode ? "text-accent-400" : "text-slate-400"} />
              <span>
                <span className={`block text-sm font-medium ${m.id === mode ? "text-white" : "text-slate-200"}`}>
                  {m.label}
                </span>
                <span className="block text-xs text-slate-500">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
