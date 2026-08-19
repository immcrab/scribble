import { useState } from "react";
import { X, CheckCircle2, XCircle, Loader2, ChevronDown, Check } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { checkWorkerHealth } from "../lib/workerClient";
import { ALL_MODELS, getDefaultModel } from "../config/models";
import { ModelFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { ToggleSwitch } from "./ToggleSwitch";

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useChatStore();
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl);
  const [password, setPassword] = useState(settings.password);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  const save = () => {
    updateSettings({ workerUrl: workerUrl.trim(), password });
    onClose();
  };

  const test = async () => {
    setStatus("checking");
    const ok = await checkWorkerHealth(workerUrl.trim());
    setStatus(ok ? "ok" : "fail");
  };

  const defaultModel = getDefaultModel(settings.defaultModelId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-base-600/60 bg-base-850 p-6 shadow-panel animate-fade-in-up"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-base-700 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <SectionLabel>Connection</SectionLabel>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Worker URL</label>
                <input
                  value={workerUrl}
                  onChange={(e) => setWorkerUrl(e.target.value)}
                  placeholder="https://scribble-worker.your-subdomain.workers.dev"
                  className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Your deployed Cloudflare Worker endpoint. Required for chat to work.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Access password (optional)</label>
                <input
                  value={password}
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Only if the Worker has SCRIBBLE_PASSWORD set"
                  className="w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={test}
                  disabled={!workerUrl.trim()}
                  className="rounded-lg border border-base-600/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-base-700/60 disabled:opacity-50"
                >
                  Test connection
                </button>
                {status === "checking" && <Loader2 size={14} className="animate-spin text-slate-400" />}
                {status === "ok" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={13} /> Reachable
                  </span>
                )}
                {status === "fail" && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <XCircle size={13} /> Unreachable
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Preferences</SectionLabel>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Default model</label>
                <Dropdown
                  menuClassName="w-full max-w-[calc(100vw-4rem)]"
                  trigger={({ open, toggle }) => (
                    <button
                      onClick={toggle}
                      className="flex w-full items-center gap-2 rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white transition-colors hover:border-accent-500/50"
                    >
                      <ModelFavicon model={defaultModel} size={15} />
                      <span className="min-w-0 flex-1 truncate text-left">{defaultModel.displayName}</span>
                      <ChevronDown size={13} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  )}
                >
                  {({ close }) => (
                    <div className="max-h-64 w-full overflow-y-auto py-1">
                      {ALL_MODELS.map((m) => (
                        <button
                          key={`${m.provider}:${m.modelId}`}
                          onClick={() => {
                            updateSettings({ defaultModelId: m.modelId });
                            close();
                          }}
                          className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                            defaultModel.modelId === m.modelId && defaultModel.provider === m.provider
                              ? "bg-accent-500/10 font-medium text-white"
                              : "text-slate-300"
                          }`}
                        >
                          <ModelFavicon model={m} size={15} />
                          <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                          {defaultModel.modelId === m.modelId && defaultModel.provider === m.provider && (
                            <Check size={13} className="shrink-0 text-accent-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </Dropdown>
                <p className="mt-1 text-xs text-slate-500">Used for new Direct/Agent/Side by Side chats.</p>
              </div>

              <ToggleSwitch
                label="Send on Enter"
                description="Off: Enter adds a newline, Ctrl/Cmd+Enter sends"
                checked={settings.sendOnEnter}
                onChange={(v) => updateSettings({ sendOnEnter: v })}
              />
              <ToggleSwitch
                label="Auto-open code panel"
                description="Detected coding requests open the workspace automatically"
                checked={settings.autoOpenCode}
                onChange={(v) => updateSettings({ autoOpenCode: v })}
              />
              <ToggleSwitch
                label="Reduce motion"
                description="Turn off streaming/hover animations"
                checked={settings.reduceMotion}
                onChange={(v) => updateSettings({ reduceMotion: v })}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
