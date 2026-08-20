import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const STORAGE_KEY = "scribble:pwa-dismissed";

/**
 * Shows an "Add to Home Screen" prompt on mobile/touch devices when the
 * browser fires the `beforeinstallprompt` event. The prompt is anchored to
 * the bottom of the viewport (above the mobile keyboard) with safe-area
 * padding so it's never clipped.
 *
 * Dismissing is remembered for 7 days so it doesn't nag.
 */
export function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only on touch devices
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isTouch) return;

    // Respect previous dismissal (7-day cooldown)
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
    }

    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    const onInstall = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
    window.addEventListener("appinstalled", onInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall as EventListener);
      window.removeEventListener("appinstalled", onInstall);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setDeferred(null);
    } else {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  };

  if (!visible) return null;

  return (
    <div
      className="pwa-install-backdrop flex items-end"
      aria-live="polite"
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "DIV") dismiss();
      }}
    >
      <div
        className="pwa-install-panel mx-4 mb-6 flex items-center gap-3 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/20 text-accent-400">
          <Download size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-100">Install ScribbleAI</div>
          <div className="text-xs text-slate-500">Add to your home screen for the full experience.</div>
        </div>
        <button
          type="button"
          onClick={install}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500 text-base-950 transition-transform hover:scale-105 active:scale-95 sm:h-auto sm:w-auto sm:rounded-lg sm:px-3 sm:py-1.5"
          title="Install"
        >
          <Download size={16} />
          <span className="hidden sm:inline">Install</span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-700/60 text-slate-400 transition-colors hover:bg-base-700 hover:text-white sm:h-auto sm:w-auto sm:rounded-lg sm:px-2.5 sm:py-1.5"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "rejected"; platform: string }>;
}
