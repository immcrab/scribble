# Adding / updating models — checklist

When a user asks to add a new AI model (or to re-sync a provider's free-tier
list), do ALL of these, not just the first one:

1. Add or update the `ModelDef` entry in `models.ts`. Every built-in provider's
   catalog (xKiro, Mistral, Gemini, OpenRouter) lives in that one file, each in
   its own `const *_MODELS` block with a comment naming the live endpoint /
   `curl` to re-check it against. Puter has no static list — its catalog is
   fetched live and the user stars favorites — so it's out of scope here.
2. Add a matching entry to **`modelDocs.ts`** in this same folder, keyed by the
   exact same `modelId`. That entry powers the public `/docs/{model}` page — a
   model missing from `modelDocs.ts` still works in the app but has no
   hand-written blurb (falls back to a generic auto-description built from its
   capabilities).
3. Remove the `modelDocs.ts` entry for any `modelId` you deleted from
   `models.ts`, so the two files stay in sync.

Do not create a new file or route per model — `modelDocs.ts` +
`src/pages/DocsPage.tsx` render every model's page from this one data file.

## Keep the "N+ models" copy in sync

Several places advertise the catalog size as a rounded-down `"N+"` string
(e.g. 56 models → `"50+"`). Anything that can run code should call
`catalogSizeLabel()` from `models.ts` (the docs pages already do). Two places
**cannot** and hold the number as static text:

- `frontend/index.html` — the `<title>`, `<meta name="description">`,
  `og:title`/`og:description`, `twitter:*` tags and the JSON-LD `featureList`, plus
  the matching `document.title` string in `src/App.tsx` and the tagline drawn into
  `public/og-image.png`.
- any marketing copy in `frontend/public/*/index.html` that cites a count.

**Rule:** whenever adding/removing models makes `getAllModels().length` cross
the next multiple of 10 (up or down), update those static `"N+ models"` strings
to match `catalogSizeLabel()`. In practice: re-check them on every batch of ~10
model changes. Keep the wording identical across those places.

## Search pages are generated from the catalog

`frontend/seo/` runs during `npm run build` (the `lofin-seo` Vite plugin) and
emits a crawlable page at `/ai-models/<slug>` for every distinct display name
in `ALL_MODELS`, plus the directory, comparison pages, `sitemap.xml` and
`llms-full.txt`. So a model added here is published automatically — a good
`modelDocs.ts` blurb is what keeps its page from being generic. Only data in
the catalog is stated on those pages, so keep `contextLength`, `capabilities`
and `free` accurate. To add a head-to-head page, add a pair of display names to
`COMPARE_PAIRS` in `frontend/seo/catalog.mjs` (unknown names are skipped).
