// Turns the built-in model catalog (src/config/models.ts + modelDocs.ts) into crawlable pages:
//   /ai-models            directory of every model
//   /ai-models/<slug>     one page per model
//   /compare              index of head-to-head pages
//   /compare/<a>-vs-<b>   head-to-head pages for popular rivals
// Everything is derived from catalog data, so adding a model to models.ts publishes its page
// on the next build. Only facts present in the catalog are stated.
import { build } from "esbuild";
import { resolve } from "node:path";
import { renderPage, table } from "./layout.mjs";
import { SITE, escapeHtml, formatTokens, slugify } from "./site.mjs";

/** Bundle a TS module from src/ and import it in Node (models.ts only needs `window` lazily). */
export async function loadTsModule(root, file) {
  const result = await build({
    entryPoints: [resolve(root, file)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    define: { "import.meta.env": "{}" },
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

/**
 * Head-to-head pairs worth a page, by display name. Same-tier rivals from different
 * vendors, plus a few same-vendor "which size?" pairs. Names that are not in the
 * catalog are skipped, so renaming a model never breaks the build.
 */
export const COMPARE_PAIRS = [
  ["Gemini 3.7 Flash", "Mistral Large 4"],
  ["Gemini 3.7 Flash", "Qwen3.8 Max"],
  ["Gemini 3.7 Flash", "GPT-OSS 120B"],
  ["Gemini 3.7 Flash", "Gemini 3.5 Flash-Lite"],
  ["Gemini 3.7 Flash", "Gemini 3.6 Flash"],
  ["Mistral Large 4", "Qwen3.8 Max"],
  ["Mistral Large 4", "Mistral Medium 3.5"],
  ["Mistral Medium 3.5", "Mistral Small 4"],
  ["Mistral Large 4", "Command A+"],
  ["Qwen3.8 Max", "Qwen3.8 Omni Flash"],
  ["Qwen3.8 Max", "Qwen3.7 Max"],
  ["Qwen3.8 Max", "GPT-OSS 120B"],
  ["Qwen3.8 Omni Flash", "Gemini 3.5 Flash-Lite"],
  ["Qwen3.8 Omni Flash", "Mistral Small 4"],
  ["GPT-OSS 120B", "GPT-OSS 20B"],
  ["GPT-OSS 120B", "Mistral Large 4"],
  ["GPT-OSS 20B", "Gemma 4 31B"],
  ["GPT-OSS 20B", "Llama 3.2 11B Vision"],
  ["Gemma 4 31B", "Mistral Small 4"],
  ["Gemma 4 31B", "Gemini 3.5 Flash-Lite"],
  ["Codestral", "Qwen 2.5 Coder 32B"],
  ["Codestral", "Devstral 2"],
  ["Codestral", "Qwen3 Coder Plus"],
  ["Qwen3 Coder Plus", "Devstral 2"],
  ["Muse Spark 1.3", "Gemini 3.7 Flash"],
  ["Muse Spark 1.3", "Qwen3.8 Max"],
  ["Nemotron 3 Ultra", "Mistral Large 4"],
  ["Nemotron 3 Ultra", "Qwen3.8 Max"],
  ["Command A+", "Qwen3.8 Max"],
  ["Command A", "Command R+ (08-2024)"],
  ["Inkling", "Gemini 3.7 Flash"],
  ["Inkling", "Qwen3.8 Max"],
  ["GLM-4.7 Flash", "GLM-4.5 Flash"],
  ["GLM-4.7 Flash", "Gemini 3.5 Flash-Lite"],
  ["Magistral Medium", "Magistral Small"],
  ["Magistral Medium", "DeepSeek R1 Distill Qwen 32B"],
];

const CAP_LABEL = { text: "Text", reasoning: "Reasoning", vision: "Image input", code: "Coding" };

/** Collapse catalog entries that are the same model served by several providers. */
export function buildGroups(models, docs, providerLabels) {
  const bySlug = new Map();
  for (const m of models) {
    const slug = slugify(m.displayName);
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(m);
  }
  return [...bySlug.entries()].map(([slug, entries]) => {
    const first = entries[0];
    const providers = [...new Set(entries.map((e) => providerLabels[e.provider] ?? e.provider))];
    const blurb = entries.map((e) => docs[e.modelId] ?? e.description).find(Boolean) ?? "";
    return {
      slug,
      name: first.displayName,
      entries,
      providers,
      contextLength: Math.max(...entries.map((e) => e.contextLength)),
      capabilities: [...new Set(entries.flatMap((e) => e.capabilities))],
      free: entries.some((e) => e.free),
      vision: entries.some((e) => e.supportsVision || e.capabilities.includes("vision")),
      streaming: entries.some((e) => e.supportsStreaming),
      blurb,
    };
  });
}

const capText = (g) => g.capabilities.map((c) => CAP_LABEL[c] ?? c).join(", ");
const yesNo = (b) => (b ? "Yes" : "No");
const modelPath = (g) => `/ai-models/${g.slug}`;

function usageSentence(g) {
  const bits = [];
  if (g.capabilities.includes("code")) bits.push("writing and reviewing code");
  if (g.capabilities.includes("reasoning")) bits.push("step-by-step reasoning on harder problems");
  if (g.vision) bits.push("questions about images and screenshots you attach");
  if (g.contextLength >= 500_000) bits.push("working through very long documents");
  else if (g.contextLength >= 128_000) bits.push("long documents and extended conversations");
  if (!bits.length) bits.push("general chat, drafting, and quick questions");
  return bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}`;
}

function access(g, defaultId) {
  return g.entries.some((e) => e.modelId === defaultId)
    ? "This is Lofin's default model, so it works the moment you open the app — no account needed."
    : "Signing in (free) is needed to use models beyond the default one.";
}

function related(g, groups, n = 6) {
  const family = g.name.split(/[\s-]/)[0].toLowerCase();
  const scored = groups
    .filter((o) => o.slug !== g.slug)
    .map((o) => {
      let score = 0;
      if (o.name.split(/[\s-]/)[0].toLowerCase() === family) score += 3;
      if (o.providers.some((p) => g.providers.includes(p))) score += 1;
      score += o.capabilities.filter((c) => g.capabilities.includes(c)).length * 0.5;
      score -= Math.abs(Math.log2(o.contextLength / g.contextLength)) * 0.2;
      return { o, score };
    })
    .sort((a, b) => b.score - a.score || a.o.name.localeCompare(b.o.name));
  return scored.slice(0, n).map((s) => s.o);
}

function modelFaqs(g) {
  const faqs = [
    {
      q: `Is ${g.name} free to use on Lofin?`,
      a: g.free
        ? `Yes. ${g.name} is marked as a free model in Lofin's catalog. Lofin's default model works without an account; signing in (also free) unlocks the rest of the catalog, and daily usage limits can apply.`
        : `${g.name} is not marked as a free model in Lofin's catalog, so access can depend on your account and current usage limits. Check the model picker in Lofin for its current status.`,
    },
    {
      q: `What is the context window of ${g.name}?`,
      a: `Lofin lists ${g.name} with a context window of about ${formatTokens(g.contextLength)} tokens (${g.contextLength.toLocaleString("en-US")}). The provider may adjust this over time.`,
    },
    {
      q: `Can ${g.name} understand images?`,
      a: g.vision
        ? `Yes. ${g.name} accepts image input, so you can attach a picture or screenshot in Lofin and ask about it.`
        : `No. In Lofin's catalog ${g.name} is a text-only model. For image questions, pick a model marked "Image input" — see the model directory.`,
    },
  ];
  return faqs;
}

export function modelPage(g, groups, pairIndex, ctx) {
  const rels = related(g, groups);
  const rivals = (pairIndex.get(g.slug) ?? []).slice(0, 8);
  const intro = g.blurb
    ? g.blurb
    : `${g.name} is a ${capText(g)
        .toLowerCase()
        .replace(/, /g, "/")} model with a ${formatTokens(g.contextLength)}-token context window, available in Lofin through ${g.providers.join(" and ")}.`;
  const body = `
      <h2>${escapeHtml(g.name)} at a glance</h2>
      <dl class="facts">
        <dt>Context window</dt><dd>${formatTokens(g.contextLength)} tokens (${g.contextLength.toLocaleString("en-US")})</dd>
        <dt>Capabilities</dt><dd>${escapeHtml(capText(g))}</dd>
        <dt>Image input</dt><dd>${yesNo(g.vision)}</dd>
        <dt>Streaming responses</dt><dd>${yesNo(g.streaming)}</dd>
        <dt>Served on Lofin via</dt><dd>${escapeHtml(g.providers.join(", "))}</dd>
        <dt>Marked free in Lofin</dt><dd>${yesNo(g.free)}</dd>
      </dl>
      <h2>What ${escapeHtml(g.name)} is good for</h2>
      <p>Based on the capabilities Lofin lists, ${escapeHtml(g.name)} is a reasonable pick for ${escapeHtml(usageSentence(g))}. Models behave differently on your own tasks, so the quickest test is to run the same prompt through two of them.</p>
      <h2>How to try ${escapeHtml(g.name)} on Lofin</h2>
      <ol>
        <li>Open <a href="/">lofin.dev</a>.</li>
        <li>Open the model picker and search for “${escapeHtml(g.name)}”.</li>
        <li>Send a prompt. ${escapeHtml(access(g, ctx.defaultId))}</li>
        <li>Want a second opinion? Use <strong>Side by Side</strong> to run it next to another model, or <strong>Battle</strong> to judge two anonymous answers.</li>
      </ol>
      ${
        rivals.length
          ? `<h2>Compare ${escapeHtml(g.name)}</h2><ul>${rivals
              .map((r) => `<li><a href="/compare/${r.path}">${escapeHtml(g.name)} vs ${escapeHtml(r.other.name)}</a></li>`)
              .join("")}</ul>`
          : ""
      }
      <h2>Similar models on Lofin</h2>
      <ul class="grid">${rels
        .map((o) => `<li><a href="${modelPath(o)}"><strong>${escapeHtml(o.name)}</strong><span>${formatTokens(o.contextLength)} context · ${escapeHtml(capText(o))}</span></a></li>`)
        .join("")}</ul>
      <p><a href="/ai-models">Browse all ${groups.length} models →</a></p>`;
  return renderPage({
    path: modelPath(g),
    title: `${g.name}: ${g.free ? "try it free, " : ""}context length & specs | Lofin`,
    description: `${g.name} on Lofin — ${formatTokens(g.contextLength)}-token context, ${capText(g).toLowerCase()}. ${g.free ? "Chat with it free online" : "See specs and how to try it"} and compare it with other AI models.`,
    h1: `${g.name}${g.free ? " — try it free online" : ""}`,
    eyebrow: "AI model",
    lede: intro,
    body,
    faqs: modelFaqs(g),
    crumbs: [
      { name: "AI models", path: "/ai-models" },
      { name: g.name, path: modelPath(g) },
    ],
    modified: ctx.modified,
    cta: `Chat with ${g.name} on Lofin`,
  });
}

export function resolvePairs(groups) {
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  const seen = new Set();
  const pairs = [];
  for (const [an, bn] of COMPARE_PAIRS) {
    const a = byName.get(an.toLowerCase());
    const b = byName.get(bn.toLowerCase());
    if (!a || !b || a.slug === b.slug) continue;
    const key = [a.slug, b.slug].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ a, b, slug: `${a.slug}-vs-${b.slug}` });
  }
  return pairs;
}

export function pairIndex(pairs) {
  const index = new Map();
  const add = (g, other, path) => {
    if (!index.has(g.slug)) index.set(g.slug, []);
    index.get(g.slug).push({ other, path });
  };
  for (const p of pairs) {
    add(p.a, p.b, p.slug);
    add(p.b, p.a, p.slug);
  }
  return index;
}

function biggerContext(a, b) {
  if (a.contextLength === b.contextLength) return `${a.name} and ${b.name} list the same context window (${formatTokens(a.contextLength)} tokens).`;
  const [big, small] = a.contextLength > b.contextLength ? [a, b] : [b, a];
  return `${big.name} has the larger context window (${formatTokens(big.contextLength)} vs ${formatTokens(small.contextLength)} tokens).`;
}

function capDiff(a, b, cap, label) {
  const ha = a.capabilities.includes(cap) || (cap === "vision" && a.vision);
  const hb = b.capabilities.includes(cap) || (cap === "vision" && b.vision);
  if (ha === hb) return ha ? `Both list ${label}.` : `Neither lists ${label}.`;
  return `Only ${ha ? a.name : b.name} lists ${label}.`;
}

export function comparePage(p, ctx) {
  const { a, b } = p;
  const rows = [
    ["Context window", `${formatTokens(a.contextLength)} tokens`, `${formatTokens(b.contextLength)} tokens`],
    ["Capabilities", escapeHtml(capText(a)), escapeHtml(capText(b))],
    ["Image input", yesNo(a.vision), yesNo(b.vision)],
    ["Reasoning", yesNo(a.capabilities.includes("reasoning")), yesNo(b.capabilities.includes("reasoning"))],
    ["Coding", yesNo(a.capabilities.includes("code")), yesNo(b.capabilities.includes("code"))],
    ["Streaming", yesNo(a.streaming), yesNo(b.streaming)],
    ["Served on Lofin via", escapeHtml(a.providers.join(", ")), escapeHtml(b.providers.join(", "))],
    ["Marked free in Lofin", yesNo(a.free), yesNo(b.free)],
  ].map(([label, x, y]) => [`<strong>${label}</strong>`, x, y]);
  const summary = [biggerContext(a, b), capDiff(a, b, "vision", "image input"), capDiff(a, b, "reasoning", "reasoning"), capDiff(a, b, "code", "coding support")];
  const faqs = [
    { q: `Which has the bigger context window, ${a.name} or ${b.name}?`, a: biggerContext(a, b) },
    { q: `Does ${a.name} or ${b.name} support images?`, a: `${capDiff(a, b, "vision", "image input")} This is based on the capabilities listed in Lofin's catalog.` },
    {
      q: `How can I compare ${a.name} and ${b.name} myself?`,
      a: `Open Lofin and use Side by Side mode to send one prompt to both models, or Battle mode to vote between two anonymous answers. Testing on your own prompt is more reliable than a spec sheet.`,
    },
  ];
  const body = `
      <h2>${escapeHtml(a.name)} vs ${escapeHtml(b.name)} — spec comparison</h2>
      ${table(["Spec", a.name, b.name], rows)}
      <h2>The short version</h2>
      <ul>${summary.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
      <p>Specs only say so much. Output quality, tone, and accuracy depend on your task, which is why it helps to run the same prompt through both.</p>
      <h2>About each model</h2>
      <h3><a href="${modelPath(a)}">${escapeHtml(a.name)}</a></h3>
      <p>${escapeHtml(a.blurb || `${a.name} is available on Lofin through ${a.providers.join(" and ")}.`)}</p>
      <h3><a href="${modelPath(b)}">${escapeHtml(b.name)}</a></h3>
      <p>${escapeHtml(b.blurb || `${b.name} is available on Lofin through ${b.providers.join(" and ")}.`)}</p>
      <h2>Run the comparison yourself</h2>
      <p>Lofin's <strong>Side by Side</strong> mode sends one prompt to two named models so you can read the answers together; <strong>Battle</strong> mode hides the names and asks you to vote. Both start without sign-up for the default model; sign in free to use any pair. More on <a href="/compare-ai-models">comparing AI models</a>.</p>
      <p><a href="/compare">All comparisons →</a> · <a href="/ai-models">Model directory →</a></p>`;
  return renderPage({
    path: `/compare/${p.slug}`,
    title: `${a.name} vs ${b.name}: context, capabilities & free comparison | Lofin`,
    description: `${a.name} vs ${b.name} compared: context window (${formatTokens(a.contextLength)} vs ${formatTokens(b.contextLength)}), image input, reasoning and coding. Run both free, side by side.`,
    h1: `${a.name} vs ${b.name}`,
    eyebrow: "AI model comparison",
    lede: `${biggerContext(a, b)} ${capDiff(a, b, "vision", "image input")} Compare them yourself on Lofin, free.`,
    body,
    faqs,
    crumbs: [
      { name: "Compare", path: "/compare" },
      { name: `${a.name} vs ${b.name}`, path: `/compare/${p.slug}` },
    ],
    modified: ctx.modified,
    cta: `Compare ${a.name} and ${b.name} free`,
  });
}

export function directoryPage(groups, ctx) {
  const sorted = [...groups].sort((x, y) => x.name.localeCompare(y.name, "en", { numeric: true }));
  const rows = sorted.map((g) => [
    `<a href="${modelPath(g)}">${escapeHtml(g.name)}</a>`,
    escapeHtml(g.providers.join(", ")),
    formatTokens(g.contextLength),
    escapeHtml(capText(g)),
    yesNo(g.free),
  ]);
  const freeCount = groups.filter((g) => g.free).length;
  const visionCount = groups.filter((g) => g.vision).length;
  const body = `
      <h2>All ${groups.length} models</h2>
      <p>Some models are served by more than one provider, so Lofin's picker shows ${ctx.listingCount} options for these ${groups.length} distinct models. ${freeCount} are marked free and ${visionCount} accept image input. Select a model for its specs and how to try it, or <a href="/compare">compare two side by side</a>.</p>
      ${table(["Model", "Provider", "Context", "Capabilities", "Free"], rows)}`;
  const itemList = {
    "@type": "ItemList",
    name: "AI models available on Lofin",
    numberOfItems: sorted.length,
    itemListElement: sorted.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${modelPath(g)}`, name: g.name })),
  };
  return renderPage({
    path: "/ai-models",
    title: `AI model directory: ${groups.length} models with context length & specs | Lofin`,
    description: `Browse ${groups.length} AI models you can chat with on Lofin — context window, reasoning, coding and image support, and which are free. Updated automatically with the catalog.`,
    h1: "AI model directory",
    eyebrow: "Catalog",
    lede: `Every AI model currently in Lofin's catalog, with context length, capabilities, and whether it is free. ${freeCount} of ${groups.length} are marked free.`,
    body,
    crumbs: [{ name: "AI models", path: "/ai-models" }],
    modified: ctx.modified,
    extraLd: [itemList],
    faqs: [
      { q: "How many AI models can I use on Lofin?", a: `Lofin's catalog currently lists ${groups.length} distinct models from several providers, and ${freeCount} of them are marked free.` },
      { q: "Which Lofin models can read images?", a: `${visionCount} models list image input. Filter the table above for "Image input" in the Capabilities column.` },
    ],
  });
}

export function compareIndexPage(pairs, ctx) {
  const body = `
      <h2>Popular head-to-head comparisons</h2>
      <ul class="grid">${pairs
        .map((p) => `<li><a href="/compare/${p.slug}"><strong>${escapeHtml(p.a.name)} vs ${escapeHtml(p.b.name)}</strong><span>${formatTokens(p.a.contextLength)} vs ${formatTokens(p.b.contextLength)} context</span></a></li>`)
        .join("")}</ul>
      <p>Don't see your pair? Open Lofin's <strong>Side by Side</strong> mode and pick any two models — see <a href="/compare-ai-models">how to compare AI models</a>.</p>`;
  return renderPage({
    path: "/compare",
    title: "Compare AI models head to head — free side-by-side | Lofin",
    description: `${pairs.length} AI model comparisons with context window, image, reasoning and coding support — then run any two models side by side on Lofin, free.`,
    h1: "Compare AI models head to head",
    eyebrow: "Comparisons",
    lede: "Pick a pair to see the specs side by side, then test both on your own prompt in Lofin.",
    body,
    crumbs: [{ name: "Compare", path: "/compare" }],
    modified: ctx.modified,
  });
}
