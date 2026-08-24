# Scribble

A polished AI playground in the spirit of Arena.ai — four modes (Battle, Agent,
Side by Side, Direct), real streaming responses, and a dark, blue, glass-panel
UI. The frontend is a static site (GitHub Pages); the Worker is a Cloudflare
Worker that proxies xKiro, Groq, Mistral, and Gemini so API keys never touch
the browser.

```
GitHub Pages (frontend) → Cloudflare Worker (proxy) → xKiro / Groq / Mistral / Gemini
```

## Project structure

```
scribble/
├─ frontend/            Vite + React + TS static site
│  ├─ src/config/        model registry — xkiroModels.ts is the one file to edit
│  │                      when xKiro's catalog changes
│  ├─ src/modes/          Battle / Agent / SideBySide / Direct screens
│  ├─ src/components/     Sidebar, ModeSelector, ModelSelector, Composer, ...
│  ├─ src/lib/            localStorage chat history, streaming client, markdown
│  ├─ src/state/          zustand chat store
│  └─ src/providers/      thin frontend-side provider abstraction
├─ worker/               Cloudflare Worker (Wrangler)
│  └─ src/adapters/       xkiro.ts / groq.ts / mistral.ts / gemini.ts
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

## 3. Add xKiro models

Edit [`frontend/src/config/xkiroModels.ts`](frontend/src/config/xkiroModels.ts).
Each entry is a plain object — `modelId` must match xKiro's id exactly, since
it's sent as-is to `https://api.xkiro.com/v1/chat/completions`. No other file
needs to change; the model shows up in every mode's selector automatically,
grouped under "xKiro".

Groq/Mistral/Gemini catalogs live in `frontend/src/config/models.ts` in the
same shape — update them there if a provider changes its free-tier lineup.

## 4. Configure Cloudflare Worker secrets

Provider API keys and the optional access password are **secrets**, never
committed and never sent to the browser:

```bash
cd worker
npx wrangler secret put XKIRO_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put GEMINI_API_KEY

# optional — gates the Worker behind a shared password (see below)
npx wrangler secret put SCRIBBLE_PASSWORD
```

You only need to set the keys for providers you actually want to serve —
a provider without a configured key returns a clear "not configured" error
instead of failing silently.

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
you'll paste it into the frontend's Settings modal after deploying.

## 6. Deploy the frontend to GitHub Pages

```bash
cd frontend
npm run build   # outputs to frontend/dist
```

`vite.config.ts` sets `base: "/scribble/"` by default — change it (or pass
`VITE_BASE=/your-repo-name/` at build time) to match your repository name, or
set it to `/` if you're using a custom domain at the root.

Push `frontend/dist` to your repo's `gh-pages` branch (or wire up a GitHub
Actions workflow that runs `npm run build` and publishes `frontend/dist`),
then enable GitHub Pages for that branch in the repo settings.

Once live, open the deployed site, go to **Settings**, and paste your
Worker's URL (and password, if you set one). Settings are stored in
`localStorage`, so this is a one-time step per browser.

## Notes

- **Chat history** lives entirely in the browser's `localStorage` — there's
  no backend database or account system.
- **Rate limiting** on the Worker is a simple in-memory per-IP counter. It's a
  practical speed bump, not a distributed guarantee — Workers isolates aren't
  shared across Cloudflare's edge, so a determined client could still exceed
  it globally. Swap in Durable Objects or KV if you need a hard limit.
- **Agent Mode** ships with the message schema and UI (`ToolActivity`) needed
  to show real tool calls, but no tool is wired up yet — it will not fabricate
  tool results. Wiring a real tool means having a Worker adapter emit
  `tool_call`/`tool_result` events in the NDJSON stream in addition to
  `delta`, and reading them into `ChatMessage.toolCalls` in the mode
  component.
