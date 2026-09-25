import { useEffect, useRef } from "react";

const SITE_KEY = "0x4AAAAAAFDwyUYIy39o_-gg";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile="true"]');
    if (existing) {
      existing.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to load."))), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to load.")));
    script.onerror = () => reject(new Error("Turnstile failed to load."));
    document.head.appendChild(script);
  });
}

export const TURNSTILE_RESET_EVENT = "lofin:turnstile-reset";

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let api: TurnstileApi | undefined;
    void loadTurnstile()
      .then((loaded) => {
        if (!active || !containerRef.current) return;
        api = loaded;
        widgetIdRef.current = loaded.render(containerRef.current, {
          sitekey: SITE_KEY,
          action: "sign_in",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));

    const reset = () => {
      if (api && widgetIdRef.current) api.reset(widgetIdRef.current);
      onToken(null);
    };
    window.addEventListener(TURNSTILE_RESET_EVENT, reset);
    return () => {
      active = false;
      window.removeEventListener(TURNSTILE_RESET_EVENT, reset);
      if (api && widgetIdRef.current) api.remove(widgetIdRef.current);
    };
  }, [onToken]);

  return <div ref={containerRef} className="flex justify-center py-1" />;
}
