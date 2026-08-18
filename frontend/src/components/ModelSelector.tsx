import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles, Zap, Wind, Gem, Eye, Check } from "lucide-react";
import type { ModelDef } from "../types";
import { modelsByProvider, PROVIDER_LABELS } from "../config/models";

const ICONS: Record<string, typeof Sparkles> = { Sparkles, Zap, Wind, Gem };

export function ModelIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon size={size} />;
}

export function ModelSelector({
  value,
  onChange,
  align = "left",
}: {
  value?: ModelDef;
  onChange: (m: ModelDef) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const grouped = modelsByProvider();

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
        className="flex items-center gap-2 rounded-lg border border-base-600/60 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 transition-colors hover:border-accent-500/50 hover:bg-base-700/60"
      >
        {value ? <ModelIcon name={value.icon} /> : <Sparkles size={14} />}
        <span className="max-w-[160px] truncate">{value ? value.displayName : "Select model"}</span>
        <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute top-full z-30 mt-2 max-h-96 w-80 origin-top overflow-y-auto rounded-xl border border-base-600/70 bg-base-850/95 shadow-panel backdrop-blur-xl animate-fade-in-up ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {(Object.keys(grouped) as (keyof typeof grouped)[]).map((provider) => (
            <div key={provider} className="py-1.5">
              <p className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {PROVIDER_LABELS[provider]}
              </p>
              {grouped[provider].map((m) => (
                <button
                  key={m.modelId}
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                    value?.modelId === m.modelId ? "bg-accent-500/10 text-white" : "text-slate-300"
                  }`}
                >
                  <ModelIcon name={m.icon} />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  {m.supportsVision && <Eye size={12} className="shrink-0 text-slate-500" />}
                  {value?.modelId === m.modelId && <Check size={13} className="shrink-0 text-accent-400" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
