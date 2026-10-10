import { expect, test } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — plain ESM build script without type declarations
import { generateSeo } from "../../seo/generate.mjs";
// @ts-expect-error — plain ESM build script without type declarations
import { STATIC_PAGES } from "../../seo/site.mjs";

let dist = "";
let result: { pages: string[]; models: number; comparisons: number };

test.beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), "lofin-seo-"));
  result = await generateSeo({ root: process.cwd(), distDir: dist });
});
test.afterAll(async () => {
  await rm(dist, { recursive: true, force: true });
});

async function htmlFiles(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await htmlFiles(dir, rel)));
    else if (entry.name === "index.html") out.push(rel);
  }
  return out;
}

test("generates landing, directory, model, comparison and changelog pages", () => {
  for (const path of ["/free-ai-playground", "/compare-ai-models", "/ai-chat-with-web-search", "/ai-models", "/compare", "/changelog"]) {
    expect(result.pages).toContain(path);
  }
  expect(result.models).toBeGreaterThan(50);
  expect(result.comparisons).toBeGreaterThan(10);
  expect(result.pages.filter((p) => p.startsWith("/ai-models/")).length).toBe(result.models);
});

test("every page has one H1, a self-referencing canonical, and valid JSON-LD", async () => {
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(join(dist, file), "utf8");
    const path = "/" + file.replace(/\/?index\.html$/, "");
    expect(html.match(/<h1[ >]/g)?.length, file).toBe(1);
    expect(html, file).toContain(`<link rel="canonical" href="https://lofin.dev${path === "/" ? "/" : path}" />`);
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ld, file).not.toBeNull();
    const graph = JSON.parse(ld![1])["@graph"];
    expect(graph.some((n: { "@type": string }) => n["@type"] === "WebPage"), file).toBe(true);
    // FAQPage markup must mirror visible content.
    for (const node of graph.filter((n: { "@type": string }) => n["@type"] === "FAQPage")) {
      for (const q of node.mainEntity) expect(html, file).toContain(q.name.replace(/&/g, "&amp;"));
    }
  }
});

test("internal links resolve to a real page or file", async () => {
  const known = new Set<string>([...result.pages, ...STATIC_PAGES.map((p: { path: string }) => p.path)]);
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(join(dist, file), "utf8");
    for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"#?]*)"/g)) {
      if (/\.[a-z0-9]+$/i.test(href)) continue; // static files such as /changelog.xml
      expect(known.has(href), `${file} links to ${href}`).toBe(true);
    }
  }
});

test("sitemap lists every generated and static page once, with lastmod", async () => {
  const xml = await readFile(join(dist, "sitemap.xml"), "utf8");
  const locs = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g)].map((m) => m[1]);
  expect(new Set(locs).size).toBe(locs.length);
  expect(locs).toContain("https://lofin.dev/");
  for (const p of result.pages) expect(locs).toContain(`https://lofin.dev${p}`);
});

test("changelog feed and llms-full.txt are emitted", async () => {
  expect(await readFile(join(dist, "changelog.xml"), "utf8")).toContain("<feed");
  const llms = await readFile(join(dist, "llms-full.txt"), "utf8");
  expect(llms).toContain("https://lofin.dev/ai-models");
});
