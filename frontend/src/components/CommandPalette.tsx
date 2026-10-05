import { useEffect, useMemo, useRef, useState } from "react";
import { Command, MessageCircle, Swords, Bot, Columns2, Image, AudioLines, Settings, Library, Plus } from "lucide-react";
import type { Mode } from "../types";

type Action = { id: string; label: string; hint: string; icon: typeof Command; run: () => void };

export function CommandPalette({ open, onClose, onNewChat, onMode, onSettings, onLibrary }: {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onMode: (mode: Mode) => void;
  onSettings: () => void;
  onLibrary: () => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  const actions = useMemo<Action[]>(() => [
    { id: "new", label: "New chat", hint: "Start a Direct chat", icon: Plus, run: onNewChat },
    { id: "direct", label: "Switch to Direct", hint: "One model", icon: MessageCircle, run: () => onMode("direct") },
    { id: "battle", label: "Open Battle Mode", hint: "Blind model comparison", icon: Swords, run: () => onMode("battle") },
    { id: "agent", label: "Open Agent Mode", hint: "Research and tools", icon: Bot, run: () => onMode("agent") },
    { id: "side", label: "Open Side by Side", hint: "Pick two models", icon: Columns2, run: () => onMode("side-by-side") },
    { id: "image", label: "Open Image Mode", hint: "Generate or edit images", icon: Image, run: () => onMode("image") },
    { id: "speech", label: "Open Text to Speech", hint: "Generate audio", icon: AudioLines, run: () => onMode("speech") },
    { id: "library", label: "Open Library", hint: "Saved images, files, and audio", icon: Library, run: onLibrary },
    { id: "settings", label: "Open Settings", hint: "Preferences and connections", icon: Settings, run: onSettings },
  ], [onNewChat, onMode, onSettings, onLibrary]);
  const shown = actions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (!open) return null;
  const pick = (action: Action) => { action.run(); onClose(); };
  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={onClose}>
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-base-600/70 bg-base-900 shadow-panel" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-base-700/60 px-3"><Command size={16} className="text-accent-300" /><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter" && shown[0]) pick(shown[0]); }} placeholder="Search commands…" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder-slate-500" /></div>
      <div className="max-h-[55vh] overflow-y-auto p-1.5">{shown.map((action) => { const Icon = action.icon; return <button key={action.id} onClick={() => pick(action)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-base-800"><Icon size={16} className="text-slate-400" /><span className="min-w-0 flex-1"><span className="block text-sm text-slate-200">{action.label}</span><span className="block text-xs text-slate-500">{action.hint}</span></span></button>; })}{shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No commands match that.</p>}</div>
      <p className="border-t border-base-700/60 px-3 py-2 text-[11px] text-slate-500">Press Enter to choose the first result · Esc to close</p>
    </div>
  </div>;
}
