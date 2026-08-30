# Scribble

A polished AI playground in the spirit of Arena.ai — six modes (Battle, Agent,
Side by Side, Direct, Image, Text to Speech), real streaming responses, and a
dark, blue, glass-panel UI. The frontend is a static site (GitHub Pages); the Worker is a Cloudflare
Worker that proxies xKiro, Mistral, Gemini, and OpenRouter (chat), Cloudflare
Workers AI / xKiro (image), xKiro (speech), and Groq (chat titles) so API keys
never touch the browser.

```
GitHub Pages (frontend) → Cloudflare Worker (proxy) → xKiro / Mistral / Gemini / OpenRouter / Cloudflare Workers AI / Groq
```

## Project structure

```
scribble/
├─ frontend/            Vite + React + TS static site
│  ├─ src/config/        model registry — models.ts is the one file to edit
│  │                      when a provider's catalog changes
│  ├─ src/modes/          Battle / Agent / SideBySide / Direct / Image / Speech screens
│  ├─ src/components/     Sidebar, ModeSelector, ModelSelector, Composer, ...
│  ├─ src/lib/            localStorage chat history, streaming client, markdown
│  ├─ src/state/          zustand chat store
│  └─ src/providers/      thin frontend-side provider abstraction
├─ worker/               Cloudflare Worker (Wrangler)
│  └─ src/adapters/       xkiro.ts / mistral.ts / gemini.ts / openrouter.ts /
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
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put GEMINI_API_KEY

# optional — gates the Worker behind a shared password (see below)
npx wrangler secret put SCRIBBLE_PASSWORD
```

You only need to set the keys for providers you actually want to serve —
a provider without a configured key returns a clear "not configured" error
instead of failing silently.

`GROQ_API_KEY` isn't tied to a selectable provider — it only powers automatic
chat-title generation (`npx wrangler secret put GROQ_API_KEY`) and is
optional; without it, chats fall back to a truncated-prompt title.

Also edit `worker/wrangler.toml` → `ALLOWED_ORIGINS` to include your deployed
GitHub Pages origin (comma-separated, no paths — e.g.
`https://your-username.github.io`). This is the Worker's CORS allowlist.

### About `SCRIBBLE_PASSWORD`

This is a basic access gate, not a real auth system: if set, the Worker
rejects any request missing a matching `X-Scribble-Password` header. It stops
casual/opportunistic use of your Worker URL, not a determined attacker. Enter
the same password in Scribble's Settings modal to unlock it client-side.

## 5. Deploy the Worker

```bash
cd worker
npx wrangler deploy
```

Copy the resulting `https://scribble-worker.<subdomain>.workers.dev` URL —
you'll paste it into the frontend's Settings modal after deploying, or bake
it in at build time via `VITE_WORKER_URL` (see below).

## 6. Deploy the frontend to GitHub Pages

```bash
cd frontend
VITE_WORKER_URL=https://scribble-worker.<subdomain>.workers.dev npm run build   # outputs to frontend/dist
```

Setting `VITE_WORKER_URL` at build time bakes in a default Worker endpoint so
visitors don't have to manually configure Settings — it's just the public
Worker URL, not a secret. Settings can still override it per-browser.

`vite.config.ts` sets `base: "/"` by default (the live site runs on a custom
domain at the root). If you deploy under a GitHub Pages subpath instead, pass
`VITE_BASE=/your-repo-name/` at build time and update the matching
`segmentCount` in `frontend/public/404.html`.

Push `frontend/dist` to your repo's `gh-pages` branch (or wire up a GitHub
Actions workflow that runs `npm run build` and publishes `frontend/dist`),
then enable GitHub Pages for that branch in the repo settings.

Once live, open the deployed site, go to **Settings**, and paste your
Worker's URL (and password, if you set one). Settings are stored in
`localStorage`, so this is a one-time step per browser.

## Notes

- **Chat history** lives in the browser's `localStorage` by default. Signing in
  with Google (Firebase Auth) syncs chats, projects, settings, and opt-in
  memories to Firebase Realtime Database for cross-device continuity; a public
  copy keyed by chat id backs the `/c/{id}` share links.
- **Gating** (sign-in required beyond the free default model, daily credit
  limits) is enforced client-side — an honour-system speed bump, not a security
  boundary. The Worker itself only checks the optional `SCRIBBLE_PASSWORD` and
  the rate limiter; anyone with the Worker URL can call it directly.
- **Rate limiting** on the Worker is a simple in-memory per-IP counter. It's a
  practical speed bump, not a distributed guarantee — Workers isolates aren't
  shared across Cloudflare's edge, so a determined client could still exceed
  it globally. Swap in Durable Objects or KV if you need a hard limit.
- **Agent Mode** streams real tool activity for the built-in **web search**
  (Groq decides per-turn whether a lookup helps, then SerpApi runs it — needs
  `SERP_API_KEY`) and **memory** (needs `GROQ_API_KEY` and the user's opt-in).
  Additional tools would emit more `toolCall` events in the NDJSON stream, read
  into `ChatMessage.toolCalls` in the mode component.
