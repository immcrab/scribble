import { TriangleAlert } from "lucide-react";

/** Shown before a Puter.js model is used for the first time in this browser
 * session — Puter.js has its own auth and its own billing, separate from
 * Scribble, so the user needs to know before they're dropped into its
 * sign-in popup. Skipped entirely once `isPuterSignedIn()` is true. */
export function PuterNoticeModal({
  modelName,
  onConfirm,
  onCancel,
}: {
  modelName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-base-600/60 bg-base-850 p-5 shadow-panel animate-fade-in-up"
      >
        <div className="mb-3 flex items-center gap-2 text-amber-400">
          <TriangleAlert size={18} />
          <h3 className="text-sm font-semibold text-white">Puter.js sign-in required</h3>
        </div>
        <p className="mb-4 text-sm text-slate-300">
          <span className="font-medium text-slate-200">{modelName}</span> runs through Puter.js, not Scribble. You'll
          be asked to sign in with a free Puter account, and it uses your own Puter credits (1,000 free per month) —
          not ours.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-sm text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
