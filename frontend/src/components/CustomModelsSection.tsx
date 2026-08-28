import { useState } from "react";
import { Plus, Trash2, Eye } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { uid } from "../lib/id";
import { PROVIDER_LABELS } from "../config/models";
import type { CustomProvider, ModelDef, Provider } from "../types";
import { ModelFavicon, ProviderFavicon, detectCustomProviderLogo } from "./ProviderIcon";
import { ToggleSwitch } from "./ToggleSwitch";

const BUILT_IN_PROVIDERS: Provider[] = ["xkiro", "mistral", "gemini", "openrouter", "puter"];

function SubLabel({ children }: { children: string }) {
  return <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

/** 128000 -> "128k", 1000000 -> "1M" — compact context-window label for the model list. */
function formatContext(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

const inputClass =
  "w-full rounded-lg border border-base-600/60 bg-base-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 placeholder-slate-500";

/**
 * Settings → user-added models and OpenAI-compatible provider connections.
 * A custom model can point at either a built-in provider (an unlisted model
 * ID on a key the Worker already holds) or one of `customProviders` (the
 * user's own endpoint + key, forwarded per-request — see runStream.ts).
 */
export function CustomModelsSection() {
  const { settings, updateSettings } = useChatStore();
  const { customProviders, customModels } = settings;

  const [providerForm, setProviderForm] = useState({ name: "", baseUrl: "", apiKey: "", logoUrl: "" });
  const [modelForm, setModelForm] = useState({
    displayName: "",
    modelId: "",
    target: BUILT_IN_PROVIDERS[0] as string,
    supportsVision: false,
    contextLength: "",
    logoUrl: "",
  });

  const DEFAULT_CONTEXT_LENGTH = 128000;

  const addProvider = () => {
    const name = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim().replace(/\/$/, "");
    const apiKey = providerForm.apiKey.trim();
    const logoUrl = providerForm.logoUrl.trim();
    if (!name || !baseUrl || !apiKey) return;
    // No logo pasted in? Guess one from the name/URL (e.g. "OpenRouter" → its real logo) before falling back to the generic plug icon.
    const provider: CustomProvider = {
      id: uid(),
      name,
      baseUrl,
      apiKey,
      logoUrl: logoUrl || detectCustomProviderLogo(name, baseUrl),
    };
    updateSettings({ customProviders: [...customProviders, provider] });
    setProviderForm({ name: "", baseUrl: "", apiKey: "", logoUrl: "" });
  };

  const removeProvider = (id: string) => {
    updateSettings({
      customProviders: customProviders.filter((p) => p.id !== id),
      // A model pointing at a deleted connection has nothing left to stream from.
      customModels: customModels.filter((m) => m.customProviderId !== id),
    });
  };

  const isBuiltInTarget = (BUILT_IN_PROVIDERS as string[]).includes(modelForm.target);

  const addModel = () => {
    const displayName = modelForm.displayName.trim();
    const modelId = modelForm.modelId.trim();
    if (!displayName || !modelId) return;

    const parsedContext = Math.floor(Number(modelForm.contextLength));
    const contextLength = Number.isFinite(parsedContext) && parsedContext > 0 ? parsedContext : DEFAULT_CONTEXT_LENGTH;

    const provider: Provider = isBuiltInTarget ? (modelForm.target as Provider) : "custom";
    // Inherit the connection's logo (pasted or auto-detected) when the model itself has none —
    // ModelFavicon reads model.logoUrl directly and has no access to the customProviders list.
    const inheritedLogoUrl = isBuiltInTarget
      ? undefined
      : customProviders.find((p) => p.id === modelForm.target)?.logoUrl;
    const model: ModelDef = {
      provider,
      modelId,
      displayName,
      icon: "Plug",
      contextLength,
      capabilities: modelForm.supportsVision ? ["text", "vision"] : ["text"],
      free: true,
      supportsStreaming: true,
      supportsVision: modelForm.supportsVision,
      isCustom: true,
      customProviderId: isBuiltInTarget ? undefined : modelForm.target,
      logoUrl: modelForm.logoUrl.trim() || inheritedLogoUrl,
    };
    updateSettings({ customModels: [...customModels, model] });
    setModelForm({ displayName: "", modelId: "", target: BUILT_IN_PROVIDERS[0], supportsVision: false, contextLength: "", logoUrl: "" });
  };

  const removeModel = (target: ModelDef) => {
    updateSettings({ customModels: customModels.filter((m) => m !== target) });
  };

  const targetLabel = (m: ModelDef) =>
    m.provider === "custom"
      ? customProviders.find((p) => p.id === m.customProviderId)?.name ?? "Deleted provider"
      : PROVIDER_LABELS[m.provider];

  return (
    <div className="space-y-5">
      <div>
        <SubLabel>Custom providers</SubLabel>
        {customProviders.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {customProviders.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm"
              >
                <ProviderFavicon provider="custom" logoUrl={p.logoUrl} size={14} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{p.name}</span>
                <span className="hidden max-w-[140px] truncate text-xs text-slate-500 sm:inline">{p.baseUrl}</span>
                <button
                  onClick={() => removeProvider(p.id)}
                  className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete provider"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-lg border border-dashed border-base-600/60 p-3">
          <input
            value={providerForm.name}
            onChange={(e) => setProviderForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name (e.g. OpenRouter)"
            className={inputClass}
          />
          <input
            value={providerForm.baseUrl}
            onChange={(e) => setProviderForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="Base URL, e.g. https://openrouter.ai/api/v1"
            className={inputClass}
          />
          <input
            value={providerForm.apiKey}
            type="password"
            onChange={(e) => setProviderForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder="API key"
            className={inputClass}
          />
          <input
            value={providerForm.logoUrl}
            onChange={(e) => setProviderForm((f) => ({ ...f, logoUrl: e.target.value }))}
            placeholder="Logo URL (optional, e.g. https://example.com/logo.png)"
            className={inputClass}
          />
          <button
            onClick={addProvider}
            disabled={!providerForm.name.trim() || !providerForm.baseUrl.trim() || !providerForm.apiKey.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} /> Add provider
          </button>
          <p className="text-xs text-slate-500">
            Must be OpenAI-compatible (a <code>/chat/completions</code> endpoint). The key is sent with each
            request through your Worker — never stored on it, and never synced to the cloud.
          </p>
        </div>
      </div>

      <div>
        <SubLabel>Custom models</SubLabel>
        {customModels.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {customModels.map((m) => (
              <div
                key={`${m.provider}:${m.customProviderId ?? ""}:${m.modelId}`}
                className="flex items-center gap-2 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm"
              >
                <ModelFavicon model={m} size={14} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{m.displayName}</span>
                <span className="hidden max-w-[110px] truncate text-xs text-slate-500 sm:inline">
                  {targetLabel(m)}
                </span>
                {!!m.contextLength && (
                  <span className="hidden shrink-0 text-xs text-slate-600 sm:inline" title={`${m.contextLength.toLocaleString()} token context window`}>
                    {formatContext(m.contextLength)}
                  </span>
                )}
                {m.supportsVision && <Eye size={12} className="shrink-0 text-sky-400" />}
                <button
                  onClick={() => removeModel(m)}
                  className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete model"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-lg border border-dashed border-base-600/60 p-3">
          <input
            value={modelForm.displayName}
            onChange={(e) => setModelForm((f) => ({ ...f, displayName: e.target.value }))}
            placeholder="Display name (e.g. GPT-5.2)"
            className={inputClass}
          />
          <input
            value={modelForm.modelId}
            onChange={(e) => setModelForm((f) => ({ ...f, modelId: e.target.value }))}
            placeholder="Model ID sent to the API (e.g. gpt-5.2)"
            className={inputClass}
          />
          <select
            value={modelForm.target}
            onChange={(e) => setModelForm((f) => ({ ...f, target: e.target.value }))}
            className={inputClass}
          >
            <optgroup label="Built-in providers">
              {BUILT_IN_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </optgroup>
            {customProviders.length > 0 && (
              <optgroup label="Custom providers">
                {customProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <input
            value={modelForm.contextLength}
            onChange={(e) => setModelForm((f) => ({ ...f, contextLength: e.target.value.replace(/[^\d]/g, "") }))}
            inputMode="numeric"
            placeholder={`Context window in tokens (optional, default ${DEFAULT_CONTEXT_LENGTH.toLocaleString()})`}
            className={inputClass}
          />
          <input
            value={modelForm.logoUrl}
            onChange={(e) => setModelForm((f) => ({ ...f, logoUrl: e.target.value }))}
            placeholder="Logo URL (optional, overrides the auto-detected icon)"
            className={inputClass}
          />
          <ToggleSwitch
            label="Supports vision"
            checked={modelForm.supportsVision}
            onChange={(v) => setModelForm((f) => ({ ...f, supportsVision: v }))}
          />
          <button
            onClick={addModel}
            disabled={!modelForm.displayName.trim() || !modelForm.modelId.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} /> Add model
          </button>
        </div>
      </div>
    </div>
  );
}
