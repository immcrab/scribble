import { useState } from "react";
import { X, CheckCircle2, XCircle, Loader2, ChevronDown, Check, Sliders, Palette, UserCircle2, Blocks, Sun, Moon, Monitor, Lock } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "../state/authStore";
import { checkWorkerHealth } from "../lib/workerClient";
import { getAllModels, getDefaultModel, isModelGated } from "../config/models";
import type { Theme } from "../lib/theme";
import { ModelFavicon } from "./ProviderIcon";
import { Dropdown } from "./Dropdown";
import { ToggleSwitch } from "./ToggleSwitch";
import { CustomModelsSection } from "./CustomModelsSection";
import { AccountSection } from "./AccountSection";
import { EffortSelector } from "./EffortSelector";
import { PuterNoticeModal } from "./PuterNoticeModal";
import { isPuterSignedIn } from "../lib/puterClient";
import type { ModelDef } from "../types";

function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

type Tab = "general" | "appearance" | "account" | "models";

const TABS: { id: Tab; label: string; icon: typeof Sliders }[] = [
  { id: "general", label: "General", icon: Sliders },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserCircle2 },
  { id: "models", label: "Models", icon: Blocks },
];

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

function AppearanceSection() {
  const { settings, updateSettings } = useChatStore();
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Theme</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => updateSettings({ theme: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.theme === id
                  ? "border-accent-500/60 bg-accent-500/10 text-white"
                  : "border-base-600/60 bg-base-900/60 text-slate-400 hover:border-base-500/60 hover:text-slate-200"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">System follows your OS's light/dark preference.</p>
      </div>

      <div>
        <SectionLabel>Default reasoning effort</SectionLabel>
        <EffortSelector value={settings.effort} onChange={(e) => updateSettings({ effort: e })} />
        <p className="mt-2 text-xs text-slate-500">
          Used for new chats — each chat can override it from its own header.
        </p>
      </div>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [tab, setTab] = useState<Tab>("general");
  const [workerUrl, setWorkerUrl] = useState(settings.workerUrl);
  const [password, setPassword] = useState(settings.password);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [pendingPuterModel, setPendingPuterModel] = useState<ModelDef | null>(null);

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
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-850 shadow-panel animate-fade-in-up"
      >
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-base-700 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-base-700/60 px-6 pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-accent-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "general" && (
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
                          {getAllModels().map((m) => {
                            const locked = isModelGated(m) && !user;
                            const isSelected = defaultModel.modelId === m.modelId && defaultModel.provider === m.provider;
                            return (
                              <button
                                key={`${m.provider}:${m.modelId}`}
                                onClick={() => {
                                  if (locked) {
                                    signInWithGoogle();
                                    return;
                                  }
                                  if (m.provider === "puter" && !isPuterSignedIn()) {
                                    setPendingPuterModel(m);
                                    close();
                                    return;
                                  }
                                  updateSettings({ defaultModelId: m.modelId });
                                  close();
                                }}
                                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-base-700/50 ${
                                  isSelected ? "bg-accent-500/10 font-medium text-white" : "text-slate-300"
                                }`}
                              >
                                <ModelFavicon model={m} size={15} />
                                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                                {locked ? (
                                  <Lock size={12} className="shrink-0 text-slate-500" />
                                ) : (
                                  isSelected && <Check size={13} className="shrink-0 text-accent-400" />
                                )}
                              </button>
                            );
                          })}
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
                    label="Web search"
                    description="Scribble decides per message whether a live web search would help, in every chat mode"
                    checked={settings.autoWebSearch}
                    onChange={(v) => updateSettings({ autoWebSearch: v })}
                  />
                  <ToggleSwitch
                    label="Reduce motion"
                    description="Turn off streaming/hover animations"
                    checked={settings.reduceMotion}
                    onChange={(v) => updateSettings({ reduceMotion: v })}
                  />
                  <ToggleSwitch
                    label="Share approximate location"
                    description="Lets Scribble give locally-relevant answers. Your browser will ask permission before sharing anything — off by default"
                    checked={settings.shareLocation}
                    onChange={(v) => updateSettings({ shareLocation: v })}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "appearance" && <AppearanceSection />}
          {tab === "account" && <AccountSection />}
          {tab === "models" && <CustomModelsSection />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-base-700/60 px-6 py-4">
          <div className="flex gap-3 text-xs text-slate-500">
            <a href="/about" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              About
            </a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              Privacy
            </a>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline">
              Terms
            </a>
          </div>
          <div className="flex gap-2">
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
    </div>
    {pendingPuterModel && (
      <PuterNoticeModal
        modelName={pendingPuterModel.displayName}
        onCancel={() => setPendingPuterModel(null)}
        onConfirm={() => {
          updateSettings({ defaultModelId: pendingPuterModel.modelId });
          setPendingPuterModel(null);
        }}
      />
    )}
    </>
  );
}
