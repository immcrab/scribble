/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL?: string;
  /** Extra comma-separated staging hostnames where Turnstile QA mode may be enabled (lib/turnstileQa.ts). */
  readonly VITE_TURNSTILE_QA_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version, injected by vite.config.ts from frontend/package.json. */
declare const __APP_VERSION__: string;
