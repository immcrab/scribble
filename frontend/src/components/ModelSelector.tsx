import { ChevronDown, Eye, Check, Sparkles, Lock, TriangleAlert } from "lucide-react";
import type { ModelDef } from "../types";
import { modelsByProvider, PROVIDER_LABELS, isModelGated } from "../config/models";
import { ModelFavicon, ProviderFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { useAuthStore } from "../state/authStore";

export function ModelIcon({ name, model, size = 15 }: { name?: string; model?: ModelDef; size?: number }) {
  if (model) return <ModelFavicon model={model} size={size} />;
  return <Sparkles size={size} />;
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
  const grouped = modelsByProvider();
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  return (
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
      {({ close }) => (
        <>
          {(Object.keys(grouped) as (keyof typeof grouped)[]).map((provider) => (
            <div key={provider} className="py-1.5 border-b border-base-700/40 last:border-b-0">
              <div className="flex items-center gap-1.5 px-3.5 pb-1 pt-1.5">
                <ProviderFavicon provider={provider} size={13} />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {PROVIDER_LABELS[provider]}
                </span>
              </div>
              {grouped[provider].map((m) => {
                const locked = isModelGated(m) && !user;
                return (
                  <button
                    key={m.modelId}
                    onClick={() => {
                      if (locked) {
                        signInWithGoogle();
                        return;
                      }
                      onChange(m);
                      close();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                      value?.modelId === m.modelId ? "bg-accent-500/10 text-white font-medium" : "text-slate-300"
                    }`}
                  >
                    <ModelFavicon model={m} size={15} />
                    <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                    {m.knownBroken && (
                      <span
                        title={m.knownBroken}
                        className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400 shrink-0"
                      >
                        <TriangleAlert size={10} strokeWidth={2.5} />
                        <span>Down</span>
                      </span>
                    )}
                    {m.supportsVision && (
                      <span
                        title="Supports image and vision input"
                        className="hidden sm:inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-400 shrink-0"
                      >
                        <Eye size={10} strokeWidth={2.5} />
                        <span>Vision</span>
                      </span>
                    )}
                    {locked ? (
                      <span title="Sign in to unlock">
                        <Lock size={12} className="shrink-0 text-slate-500" />
                      </span>
                    ) : (
                      value?.modelId === m.modelId && <Check size={13} className="shrink-0 text-accent-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </Dropdown>
  );
}
