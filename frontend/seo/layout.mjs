// HTML shell shared by every generated SEO page. Pages are plain static HTML (no React)
// so crawlers and AI answer engines get the full text on the first response.
import { SITE, SITE_NAME, OG_IMAGE, escapeHtml, jsonLd } from "./site.mjs";

export const SEO_CSS = `:root { color-scheme: dark; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #1b1a18; color: #e7e1da; font-family: "Inter", ui-sans-serif, system-ui, sans-serif; line-height: 1.7; }
.wrap { width: min(100% - 36px, 820px); margin: 0 auto; padding: 38px 0 90px; }
header.top { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 44px; flex-wrap: wrap; }
.brand { color: #f5f0eb; font-weight: 600; text-decoration: none; font-size: 1.05rem; }
.cta { display: inline-block; border: 1px solid #8d857c; border-radius: 999px; color: #f5f0eb; font-size: .84rem; font-weight: 600; padding: 8px 16px; text-decoration: none; background: #2a2724; }
.cta:hover { background: #34302c; }
.cta.big { font-size: .95rem; padding: 12px 22px; margin: 6px 0 4px; }
.crumbs { margin: 0 0 22px; color: #9f978e; font-size: .8rem; }
.crumbs a { color: #aaa39b; text-decoration: none; }
.crumbs a:hover { color: #fff; text-decoration: underline; }
.eyebrow { margin: 0 0 12px; color: #aca49a; font-size: .72rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
h1, h2, h3 { color: #f8f3ee; }
h1 { margin: 0; font-family: "Source Serif 4", ui-serif, Georgia, serif; font-size: clamp(2.1rem, 6.5vw, 3.6rem); font-weight: 300; letter-spacing: -.035em; line-height: 1.08; }
h2 { margin: 2.6rem 0 14px; font-size: 1.4rem; line-height: 1.25; }
h3 { margin: 1.7rem 0 .5rem; font-size: 1.02rem; }
p, li, dd { color: #c7c2bc; font-size: .98rem; }
p { margin: 0 0 16px; }
a { color: #f5f0eb; text-decoration: underline; text-decoration-color: #6c655c; text-underline-offset: 3px; }
a:hover { color: #fff; }
.lede { max-width: 700px; margin: 22px 0 18px; color: #d3ccc4; font-family: "Source Serif 4", ui-serif, Georgia, serif; font-size: clamp(1.15rem, 2.4vw, 1.4rem); line-height: 1.5; }
.updated { color: #8f877e; font-size: .78rem; margin: 0 0 26px; }
ul, ol { padding-left: 1.25em; margin: .6em 0 1.15em; }
li { margin: .45em 0; }
.callout { margin: 24px 0; padding: 16px 20px; border-left: 2px solid #aaa096; background: #23211f; color: #b8b0a8; }
.callout strong { color: #f1ebe5; }
.table-wrap { overflow-x: auto; margin: 18px 0 26px; border: 1px solid #3a3733; border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #33302c; vertical-align: top; }
th { color: #f1ebe5; font-weight: 600; background: #22201d; white-space: nowrap; }
td { color: #c7c2bc; }
tr:last-child td { border-bottom: 0; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0; margin: 18px 0 26px; border: 1px solid #3a3733; border-radius: 12px; overflow: hidden; }
dl.facts dt, dl.facts dd { margin: 0; padding: 10px 16px; border-bottom: 1px solid #33302c; }
dl.facts dt { color: #f1ebe5; font-weight: 600; font-size: .86rem; background: #22201d; }
dl.facts dd:last-of-type, dl.facts dt:last-of-type { border-bottom: 0; }
.faq details { border: 1px solid #3a3733; border-radius: 12px; padding: 4px 18px; margin: 10px 0; background: #22201d; }
.faq summary { cursor: pointer; padding: 12px 0; color: #f1ebe5; font-weight: 600; font-size: .98rem; }
.faq details p { margin: 0 0 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 18px 0 28px; padding: 0; list-style: none; }
.grid li { margin: 0; }
.grid a { display: block; border: 1px solid #423d38; border-radius: 12px; background: #22201d; padding: 14px 16px; text-decoration: none; height: 100%; }
.grid a:hover { background: #2a2724; border-color: #8d857c; }
.grid strong { display: block; color: #f5f0eb; font-size: .95rem; }
.grid span { color: #aaa39b; font-size: .8rem; }
code { color: #e7e1da; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em; }
footer.site { margin-top: 76px; padding-top: 24px; border-top: 1px solid #3a3733; color: #827c73; font-size: .83rem; }
footer.site p { font-size: .83rem; color: #827c73; margin: 0 0 10px; }
footer.site a { color: #aaa39b; }
@media (max-width: 620px) { .wrap { width: min(100% - 32px, 820px); padding-top: 28px; } dl.facts { grid-template-columns: 1fr; } dl.facts dt { border-bottom: 0; padding-bottom: 2px; } }
`;

const FOOTER_LINKS = [
  ["/free-ai-playground", "Free AI playground"],
  ["/ai-models", "AI model directory"],
  ["/compare", "Compare AI models"],
  ["/changelog", "What's new"],
  ["/guides", "Guides"],
  ["/about", "About"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
];

/**
 * @param {object} p
 * @param {string} p.path           canonical path, e.g. "/ai-models/gemini-3-7-flash"
 * @param {string} p.title          <title> and og:title
 * @param {string} p.description    meta description
 * @param {string} p.h1
 * @param {string} [p.eyebrow]
 * @param {string} p.lede           plain-text direct answer, shown under the H1
 * @param {string} p.body           pre-escaped HTML for the main content
 * @param {{q:string,a:string}[]} [p.faqs]  rendered visibly and as FAQPage JSON-LD
 * @param {{name:string,path:string}[]} [p.crumbs]  trail after Home (last item is the page itself)
 * @param {string} p.modified       YYYY-MM-DD
 * @param {string} [p.cta]          label for the big call-to-action button
 * @param {object[]} [p.extraLd]    extra JSON-LD nodes
 */
export function renderPage(p) {
  const url = `${SITE}${p.path}`;
  const crumbs = [{ name: "Lofin", path: "/" }, ...(p.crumbs ?? [])];
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: p.title,
      description: p.description,
      inLanguage: "en",
      dateModified: p.modified,
      isPartOf: { "@id": `${SITE}/#website` },
      about: { "@id": `${SITE}/#app` },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
    },
    ...(p.faqs?.length
      ? [{ "@type": "FAQPage", mainEntity: p.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }]
      : []),
    ...(p.extraLd ?? []),
  ];

  const crumbHtml = crumbs
    .map((c, i) => (i === crumbs.length - 1 ? `<span aria-current="page">${escapeHtml(c.name)}</span>` : `<a href="${c.path}">${escapeHtml(c.name)}</a>`))
    .join(" › ");

  const faqHtml = p.faqs?.length
    ? `<section class="faq" aria-labelledby="faq"><h2 id="faq">Frequently asked questions</h2>${p.faqs
        .map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`)
        .join("")}</section>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(p.title)}</title>
    <meta name="description" content="${escapeHtml(p.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="Lofin information for AI systems" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(p.title)}" />
    <meta property="og:description" content="${escapeHtml(p.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(p.title)}" />
    <meta name="twitter:description" content="${escapeHtml(p.description)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <meta name="theme-color" content="#1b1a18" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,300;8..60,500;8..60,600&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/seo.css" />
    ${p.headExtra ?? ""}
    <script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
  </head>
  <body>
    <main class="wrap">
      <header class="top"><a class="brand" href="/">Lofin</a><a class="cta" href="/">Open Lofin <span aria-hidden="true">↗</span></a></header>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbHtml}</nav>
      ${p.eyebrow ? `<p class="eyebrow">${escapeHtml(p.eyebrow)}</p>` : ""}
      <h1>${escapeHtml(p.h1)}</h1>
      <p class="lede">${escapeHtml(p.lede)}</p>
      <a class="cta big" href="/">${escapeHtml(p.cta ?? "Try Lofin free — no sign-up")}</a>
      <p class="updated">Last updated <time datetime="${p.modified}">${p.modified}</time></p>
${p.body}
${faqHtml}
      <footer class="site">
        <p>Lofin is an independently run AI playground. The models available through it are built and owned by third parties; Lofin does not train or own them. Details and availability can change.</p>
        <p>${FOOTER_LINKS.map(([href, label]) => `<a href="${href}">${label}</a>`).join(" · ")} · <a href="https://docs.lofin.dev/">Documentation</a></p>
      </footer>
    </main>
  </body>
</html>
`;
}

export function table(headers, rows) {
  const head = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
