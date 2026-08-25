# Adding a new model — checklist

When a user asks to add a new AI model, do BOTH of these, not just the first one:

1. Add the `ModelDef` entry to `models.ts` — every provider's catalog (xKiro, Mistral,
   Gemini, OpenRouter, Puter) lives in that one file.
2. Add a matching entry to **`modelDocs.ts`** in this same folder, keyed by the exact same
   `modelId`. That entry powers the public `/docs/{model}` page — a model missing from
   `modelDocs.ts` still works in the app but has no docs page (falls back to a generic
   auto-description built from its capabilities).

Do not create a new file or route per model — `modelDocs.ts` + `src/pages/DocsPage.tsx`
render every model's page from this one data file.
