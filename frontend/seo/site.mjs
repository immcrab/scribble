// Shared constants and small helpers for the build-time SEO generator.
import { execFileSync } from "node:child_process";

export const SITE = "https://lofin.dev";
export const SITE_NAME = "Lofin";
export const OG_IMAGE = `${SITE}/og-image.png`;

/** Hand-written static pages in public/ that are not generated but belong in the sitemap. */
export const STATIC_PAGES = [
  { path: "/", files: ["index.html"] },
  { path: "/about", files: ["public/about/index.html"] },
  { path: "/about/creator", files: ["public/about/creator/index.html"] },
  { path: "/guides", files: ["public/guides/index.html"] },
  { path: "/privacy", files: ["public/privacy/index.html"] },
  { path: "/terms", files: ["public/terms/index.html"] },
];

export function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON for an inline <script type="application/ld+json">; `<` is escaped so content can never close the tag. */
export function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "1000000" -> "1M", "262144" -> "262K", "8000" -> "8K". */
export function formatTokens(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(Math.round(m * 10) / 10) ? Math.round(m) : (Math.round(m * 10) / 10).toFixed(1)}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Date (YYYY-MM-DD) of the newest commit touching any of `paths`, relative to the repo
 * root. Falls back to today's date when git is unavailable (e.g. a source tarball), so
 * the build never fails over a missing lastmod.
 */
export function gitDate(repoRoot, paths) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...paths], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : today();
  } catch {
    return today();
  }
}

export function maxDate(...dates) {
  return dates.filter(Boolean).sort().at(-1);
}
