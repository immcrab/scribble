import { useState } from "react";
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { checkWorkerHealth } from "../lib/workerClient";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-fade-in-up rounded-2xl border border-base-600/60 bg-base-850 p-6 shadow-panel"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-base-700 hover:text-white">
            <X size={18} />
          </button>
        </div>

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
