import { Feather, Waves, Flame, Rocket, Infinity as InfinityIcon, ChevronDown } from "lucide-react";
import type { Effort } from "../types";
import { Dropdown } from "./Dropdown";

const EFFORTS: { id: Effort; label: string; desc: string; icon: typeof Feather }[] = [
  { id: "low", label: "Low", desc: "Fastest — brief reasoning", icon: Feather },
  { id: "medium", label: "Medium", desc: "Balanced depth and speed", icon: Waves },
  { id: "high", label: "High", desc: "Thorough, double-checked", icon: Flame },
  { id: "extra", label: "Extra", desc: "Extensive, multi-angle reasoning", icon: Rocket },
  { id: "ultra", label: "Ultra", desc: "As exhaustive as the model allows", icon: InfinityIcon },
];

/** Claude-Code-style reasoning-effort picker — dropped into each mode's header row
 * next to ModelSelector. Actual effect varies by provider (native knob on Gemini,
 * a system-prompt depth nudge elsewhere) — see worker/src/adapters. */
export function EffortSelector({ value, onChange }: { value: Effort; onChange: (e: Effort) => void }) {
  const current = EFFORTS.find((e) => e.id === value) ?? EFFORTS[1];

  return (
    <Dropdown
      align="right"
      menuClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent-500/50 hover:bg-base-700/60"
          title="Reasoning effort"
        >
          <current.icon size={14} className="text-accent-400" />
          {current.label}
          <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          {EFFORTS.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                onChange(e.id);
                close();
              }}
              className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                e.id === value ? "bg-accent-500/10" : "hover:bg-base-700/50"
              }`}
            >
              <e.icon size={15} className={`mt-0.5 shrink-0 ${e.id === value ? "text-accent-400" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${e.id === value ? "text-white" : "text-slate-200"}`}>
                  {e.label}
                </span>
                <span className="block text-xs text-slate-500">{e.desc}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}
