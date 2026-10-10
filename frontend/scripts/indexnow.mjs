// Tells IndexNow-compatible search engines (Bing, Yandex, Seznam, Naver, ...) which lofin.dev
// URLs changed, so they re-crawl right after a deploy instead of days later. Run by the
// deploy workflow after `wrangler deploy`; never part of the app build. Best effort: a
// failure prints a warning and exits 0 so a search-engine hiccup can't fail a deploy.
//
//   node scripts/indexnow.mjs            # submit URLs whose sitemap <lastmod> is within 3 days
//   node scripts/indexnow.mjs --all      # submit every URL in the sitemap
//   node scripts/indexnow.mjs --dry-run  # print what would be sent
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOST = "lofin.dev";
const args = new Set(process.argv.slice(2));
const publicDir = join(process.cwd(), "public");

// The key is public by design: IndexNow verifies ownership by fetching /<key>.txt from the host.
const keyFile = readdirSync(publicDir).find((f) => /^[0-9a-f]{32}\.txt$/.test(f) && readFileSync(join(publicDir, f), "utf8").trim() === f.slice(0, -4));
if (!keyFile) {
  console.warn("[indexnow] no <key>.txt file found in public/ — skipping");
  process.exit(0);
}
const key = keyFile.slice(0, -4);

const sitemap = readFileSync(join(process.cwd(), "dist", "sitemap.xml"), "utf8");
const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
const urls = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)]
  .filter(([, , lastmod]) => args.has("--all") || lastmod >= cutoff)
  .map(([, loc]) => loc)
  .filter((loc) => new URL(loc).hostname === HOST)
  .slice(0, 10_000);

if (!urls.length) {
  console.log("[indexnow] nothing changed recently — nothing to submit");
  process.exit(0);
}
if (args.has("--dry-run")) {
  console.log(`[indexnow] would submit ${urls.length} URLs:\n${urls.join("\n")}`);
  process.exit(0);
}

try {
  const res = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls }),
  });
  console.log(`[indexnow] submitted ${urls.length} URLs — HTTP ${res.status}`);
} catch (err) {
  console.warn(`[indexnow] submission failed: ${err instanceof Error ? err.message : err}`);
}
