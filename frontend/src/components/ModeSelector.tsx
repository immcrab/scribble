import { Swords, Bot, Columns2, MessageCircle, ChevronDown, Lock, Image as ImageIcon, AudioLines } from "lucide-react";
import type { Mode } from "../types";
import { Dropdown } from "./Dropdown";
import { useAuthStore } from "../state/authStore";
import { isLocalDev } from "../lib/devMode";

const MODES: { id: Mode; label: string; desc: string; icon: typeof Swords; gated?: boolean }[] = [
  { id: "battle", label: "Battle Mode", desc: "Two hidden models answer — you vote", icon: Swords, gated: true },
  { id: "agent", label: "Agent Mode", desc: "Tool-using tasks with live web search", icon: Bot, gated: true },
  { id: "side-by-side", label: "Side by Side", desc: "Compare two models you pick, side by side", icon: Columns2, gated: true },
  { id: "image", label: "Image", desc: "Generate or edit images from a prompt", icon: ImageIcon, gated: true },
  { id: "speech", label: "Text to Speech", desc: "Turn text into audio you can download", icon: AudioLines, gated: true },
  { id: "direct", label: "Direct", desc: "A normal one-on-one chat with one model", icon: MessageCircle },
];

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const current = MODES.find((m) => m.id === mode)!;
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  return (
    <Dropdown
      menuClassName="w-72 max-w-[calc(100vw-2rem)] overflow-hidden"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-base-600 hover:bg-base-800/70"
        >
          <current.icon size={16} className="text-accent-400" />
          {current.label}
          <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          {MODES.map((m) => {
            const locked = m.gated && !user && !isLocalDev();
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (locked) {
                    signInWithGoogle();
                    return;
                  }
                  onChange(m.id);
                  close();
                }}
                className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors ${
                  m.id === mode ? "bg-accent-500/10" : "hover:bg-base-700/50"
                }`}
              >
                <m.icon size={18} className={m.id === mode ? "text-accent-400" : "text-slate-400"} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${m.id === mode ? "text-white" : "text-slate-200"}`}>
                    {m.label}
                  </span>
                  <span className="block text-xs text-slate-500">{m.desc}</span>
                  {locked && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-accent-400/90">
                      <Lock size={10} /> Sign in to unlock
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </>
      )}
    </Dropdown>
  );
}
