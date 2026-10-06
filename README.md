# Lofin

A polished AI playground in the spirit of Arena.ai — six modes (Battle, Agent,
Side by Side, Direct, Image, Text to Speech), a writing Tutor that learns your
voice from your own work, real streaming responses, and a
dark, blue, glass-panel UI. The frontend is a static site (GitHub Pages); the Worker is a Cloudflare
Worker that proxies xKiro, Mistral, Gemini, OpenRouter, and Z.ai / GLM (chat), Exa (web search), and xKiro's free image model so API keys
never touch the browser.

```
GitHub Pages (frontend) → Cloudflare Worker (proxy) → xKiro / Mistral / Gemini / OpenRouter / Z.ai (GLM) / Exa (search)
```

## Project structure

```
lofin/
├─ frontend/            Vite + React + TS static site
│  ├─ src/config/        model registry — models.ts is the one file to edit
│  │                      when a provider's catalog changes
│  ├─ src/modes/          Battle / Agent / SideBySide / Direct / Image / Speech screens
│  ├─ src/pages/          standalone routes: /docs, /admin, /usage, /tutor
│  ├─ src/components/     Sidebar, ModeSelector, ModelSelector, Composer, ...
│  ├─ src/lib/            localStorage chat history, streaming client, markdown
│  ├─ src/state/          zustand chat store
│  └─ src/providers/      thin frontend-side provider abstraction
├─ worker/               Cloudflare Worker (Wrangler)
│  └─ src/adapters/       xkiro.ts / image.ts / xkiroImage.ts / xkiroSpeech.ts /
│                          image.ts / xkiroImage.ts / xkiroSpeech.ts / search.ts /
│                          memory.ts / title.ts
└─ README.md
```

## 1. Install dependencies

```bash
cd frontend && npm install
cd ../worker && npm install
```

## 2. Run locally

```bash
# terminal 1 — Worker
cd worker
npx wrangler dev

# terminal 2 — frontend
cd frontend
npm run dev
```

Open the frontend, click **Settings** (bottom of the sidebar), and set **Worker
URL** to `http://127.0.0.1:8787` (the local Wrangler dev address). Nothing
else is required for local dev — provider keys live only in the Worker.

## 3. Add models

Edit [`frontend/src/config/models.ts`](frontend/src/config/models.ts). Each
entry is a plain object; xKiro's `modelId` must match xKiro's id exactly,
since it's sent as-is to `https://api.xkiro.com/v1/chat/completions`. No other
file needs to change — the model shows up in every mode's selector
automatically, grouped by provider.

### Editing the catalog at runtime (`/admin`)

`models.ts` is the source of truth, but the signed-in admin account
(`imcrabfr@gmail.com`, set in `frontend/src/lib/admin.ts`) can also **publish or
hide models for every visitor** from the `/admin` page — no rebuild. Those edits
live in a single Realtime Database node, `catalog/v1`, that every visitor reads on
load (`frontend/src/lib/catalogSync.ts`); regular users' own custom models stay
per-browser in Settings → Models as before.

For the admin writes to land, add a rule for that node in the Firebase console
(Realtime Database → Rules) alongside the existing `users` / `publicChats` rules:

```json
"catalog": {
  ".read": true,
  ".write": "auth != null && auth.token.email === 'imcrabfr@gmail.com' && auth.token.email_verified === true"
}
```

Until that rule exists the `/admin` page still works but shows a
"permission denied" banner and nothing publishes.

## 4. Configure Cloudflare Worker secrets

Provider API keys and the optional access password are **secrets**, never
committed and never sent to the browser:

```bash
cd worker
npx wrangler secret put XKIRO_API_KEY
npx wrangler secret put EXA_API_KEY

# optional — gates the Worker behind a shared password (see below)
npx wrangler secret put LOFIN_PASSWORD
```

`XKIRO_API_KEY` is required for xKiro chat models. `EXA_API_KEY` enables live web search.

`GROQ_API_KEY` enables the Groq models in the picker and also powers automatic
chat-title generation (`npx wrangler secret put GROQ_API_KEY`). Without it,
the Groq section reports that its provider is not configured and chats fall
back to a truncated-prompt title.

Also edit `worker/wrangler.toml` → `ALLOWED_ORIGINS` to include your deployed
GitHub Pages origin (comma-separated, no paths — e.g.
`https://your-username.github.io`). This is the Worker's CORS allowlist.

### About `LOFIN_PASSWORD`

This is a basic access gate, not a real auth system: if set, the Worker
rejects any request missing a matching `X-Lofin-Password` header. It stops
casual/opportunistic use of your Worker URL, not a determined attacker. Enter
the same password in Lofin's Settings modal to unlock it client-side.

## 5. Deploy the Worker

```bash
cd worker
npx wrangler deploy
```

Copy the resulting `https://lofin.<subdomain>.workers.dev` URL —
you'll paste it into the frontend's Settings modal after deploying, or bake
it in at build time via `VITE_WORKER_URL` (see below).

For the production lofin deployment, the custom API endpoint is
`https://ai.lofin.dev`; it is the default in Advanced Settings and is
served by the same `lofin` Worker.

### Temporary AI-generated websites

When a signed-in user asks Lofin to create a website and the reply contains an
`index.html` artifact, Lofin saves the original generated files in the
`scribble-announcements` R2 bucket under a separate `sites/<uid>/<site>/`
prefix. Each active site is also listed in **Settings → Storage → Published
websites**, alongside the user's uploaded files and generated images. It
automatically shows a public link in the code workspace:

```
https://api.lofin.dev/<firebase-user-id>/<site-id>
```

Published sites use the isolated `api.lofin.dev` origin, are available for
seven days, and are then removed by the Worker's hourly scheduled cleanup (or
immediately after an expired link is visited). The Worker validates Firebase
sign-in before accepting an upload, limits each site to 100 text files / 10 MB,
and rejects traversal paths. Keep the `ANNOUNCEMENT_ASSETS` R2 binding and the
`api.lofin.dev` custom-domain route in `worker/wrangler.toml` when deploying
this feature.

## 6. Deploy the frontend to GitHub Pages

```bash
cd frontend
VITE_WORKER_URL=https://lofin.<subdomain>.workers.dev npm run build   # outputs to frontend/dist
```

Setting `VITE_WORKER_URL` at build time bakes in a default Worker endpoint so
visitors don't have to manually configure Settings — it's just the public
Worker URL, not a secret. Settings can still override it per-browser.

`vite.config.ts` sets `base: "/"` by default (the live site runs on a custom
domain at the root). If you deploy under a GitHub Pages subpath instead, pass
`VITE_BASE=/your-repo-name/` at build time; the build automatically configures
the matching SPA 404 fallback.

The deployment workflow builds the primary Worker site at `/` and a separate
GitHub Pages fallback at `/scribble/`. Enable **Settings → Pages → Source →
GitHub Actions** once; its public URL is `https://immcrab.github.io/scribble/`.
Also add `immcrab.github.io` to the production Turnstile widget's allowed
hostnames before using that fallback, so the existing human-verification gate
continues to work there.

Once live, open the deployed site, go to **Settings**, and paste your
Worker's URL (and password, if you set one). Settings are stored in
`localStorage`, so this is a one-time step per browser.

### Preventing iframe embedding

Lofin includes a client-side fallback that hides the site when it is loaded in
an iframe. Since GitHub Pages cannot set security response headers, configure
this in Cloudflare too for enforceable protection: add a **Response Header
Transform Rule** for `lofin.dev` that sets both
`X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.
The Cloudflare rule prevents framing before any page JavaScript can run.

## Notes

- **Chat history and preferences** live in the browser's `localStorage` by
  default. Signing in with Google (Firebase Auth) syncs chats and ordinary
  preferences to Cloud Firestore for cross-device continuity; a public
  Firestore document keyed by chat id backs the `/c/{id}` share links. Passwords
  and custom-provider API keys intentionally remain on their original device.
  Projects and opt-in memories remain in Realtime Database.

  Enable Cloud Firestore before deploying this version, then publish
  [`firestore.rules`](./firestore.rules). The public-share rule deliberately
  permits unauthed reads and writes because guests can create and share chats;
  those links are unlisted UUIDs, not private access-controlled resources.
- **Gating** (sign-in required beyond the free default model, daily credit
  limits) is enforced client-side — an honour-system speed bump, not a security
  boundary. The Worker itself only checks the optional `LOFIN_PASSWORD` and
  the rate limiter; anyone with the Worker URL can call it directly.
- **Rate limiting** on the Worker is a simple in-memory per-IP counter. It's a
  practical speed bump, not a distributed guarantee — Workers isolates aren't
  shared across Cloudflare's edge, so a determined client could still exceed
  it globally. Swap in Durable Objects or KV if you need a hard limit.
- **Tutor** (`/tutor`) is a separate screen, not a chat mode. You give it your own
  writing — typed, dropped in as a text file, or photographed (a vision model
  transcribes those) — and it derives a *style profile* from the corpus, which then
  rides in the prompt of every later turn so replies are written in your voice.
  Samples, profile, and conversation are saved to Realtime Database at
  `users/{uid}/tutorJson` (`src/lib/tutorSync.ts`) — covered by the existing `users`
  rule, so no new rule is needed. They stay out of the sidebar's chat history and out
  of the `/c/{id}` share links. Because RTDB is the only store, a signed-out visitor's
  tutor session is in-memory only and the page says so; the model picker includes the
  user's own models from Settings → Models, custom endpoints included.
  The model is chosen per message (`src/lib/tutorRouter.ts`) — vision for images, a
  reasoning model for maths, a coding model for code, the best prose model for
  writing — with a manual override in the header. Maths renders as real LaTeX via
  KaTeX (`<Markdown math />`, opt-in so ordinary chats keep bare `$` signs intact).

- **Agent Mode** streams real tool activity for the built-in **web search**
  (Groq can decide per-turn whether a lookup helps, then xKiro runs it with the
  existing `XKIRO_API_KEY`) and **memory** (needs `GROQ_API_KEY` and the user's opt-in).
  Additional tools would emit more `toolCall` events in the NDJSON stream, read
  into `ChatMessage.toolCalls` in the mode component.
