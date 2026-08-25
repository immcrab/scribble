import { MapPin } from "lucide-react";
import { useLocationPrompt } from "../lib/locationPrompt";
import { useChatStore } from "../state/chatStore";

/** In-site popup asking whether to share an IP-derived approximate location — never the
 * browser's own geolocation prompt. Triggered from lib/clientContext.ts: once the first time
 * consent is unset, and again after a denial only if the user sends a message that looks like
 * it's asking about their own whereabouts. Always changeable afterward in Settings. */
export function LocationConsentPrompt() {
  const visible = useLocationPrompt((s) => s.visible);
  const dismiss = useLocationPrompt((s) => s.dismiss);
  const updateSettings = useChatStore((s) => s.updateSettings);

  if (!visible) return null;

  function decide(granted: boolean) {
    updateSettings({ locationConsent: granted ? "granted" : "denied" });
    dismiss();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => decide(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-base-600/60 bg-base-850 p-5 shadow-panel animate-fade-in-up"
      >
        <div className="mb-3 flex items-center gap-2 text-accent-400">
          <MapPin size={18} />
          <h3 className="text-sm font-semibold text-white">Share your approximate location?</h3>
        </div>
        <p className="mb-4 text-sm text-slate-300">
          Scribble can estimate your city from your IP address to give locally-relevant answers — not exact GPS, and
          nothing more precise than city-level. You can change this anytime in Settings.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => decide(false)} className="rounded-lg px-3.5 py-2 text-sm text-slate-400 hover:text-white">
            Not now
          </button>
          <button
            onClick={() => decide(true)}
            className="rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
