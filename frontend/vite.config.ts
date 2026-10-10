import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Single source of truth for the version shown in the sidebar: frontend/package.json.
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

/**
 * GitHub Pages serves this repository below `/scribble/`, while the production
 * Worker serves it at `/`. Vite copies public/404.html verbatim, so replace its
 * small deployment placeholders after every build rather than leaving deep
 * links broken on the Pages copy.
 */
function configureSpa404() {
  return {
    name: "lofin-spa-404",
    async closeBundle() {
      const base = process.env.VITE_BASE ?? "/";
      const normalizedBase = base.endsWith("/") ? base : `${base}/`;
      const segmentCount = normalizedBase.split("/").filter(Boolean).length;
      const path = resolve(process.cwd(), "dist", "404.html");
      const source = await readFile(path, "utf8");
      await writeFile(
        path,
        source
          .replaceAll("__LOFIN_BASE_PATH__", normalizedBase)
          .replace("__LOFIN_404_SEGMENT_COUNT__", String(segmentCount)),
      );
    },
  };
}

/**
 * Emits the crawlable pages (landing pages, per-model and comparison pages, changelog),
 * sitemap.xml and llms-full.txt into dist/ — see frontend/seo/. Skipped for the docs
 * deployment (own sitemap, avoids duplicate content) and for sub-path builds.
 */
function lofinSeo() {
  return {
    name: "lofin-seo",
    apply: "build" as const,
    async closeBundle() {
      if (process.env.VITE_DOCS_SITE === "true") return;
      // The GitHub Pages fallback is built under a sub-path; these pages assume the site root.
      if (process.env.VITE_BASE && process.env.VITE_BASE !== "/") return;
      const entry = pathToFileURL(resolve(process.cwd(), "seo/generate.mjs")).href;
      const { generateSeo } = await import(/* @vite-ignore */ entry);
      const result = await generateSeo({ root: process.cwd(), distDir: resolve(process.cwd(), "dist") });
      console.log(`[lofin-seo] ${result.pages.length} pages (${result.models} models, ${result.comparisons} comparisons)`);
    },
  };
}

// Deployed at the lofin.dev custom-domain root, so base is "/". Override with
// VITE_BASE at build time if you ever deploy under a GitHub Pages subpath instead
// (e.g. "/lofin/") — also update the matching segmentCount in public/404.html.
export default defineConfig({
  plugins: [
    react(),
    configureSpa404(),
    lofinSeo(),
    // Vite warns for an unset %VITE_*% HTML replacement. This token has a
    // stable app-build default while preserving the docs deployment's opt-in.
    {
      name: "lofin-docs-static-fallback",
      transformIndexHtml(html) {
        const docs = process.env.VITE_DOCS_SITE === "true";
        // The home page's JSON-LD describes lofin.dev; the docs host must not carry it.
        const out = docs ? html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, "") : html;
        return out.replace("__LOFIN_DOCS_SITE__", docs ? "true" : "false");
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    // Playwright reaches the dev server as "app.lofin.test" (mapped to 127.0.0.1 by the
    // browser) so the app behaves like a real, non-localhost deployment. Dev server only.
    allowedHosts: process.env.LOFIN_E2E ? [".lofin.test"] : undefined,
  },
  // Deps only reached through lazy imports are otherwise discovered mid-session, which
  // makes the dev server re-optimize and force-reload every open page.
  optimizeDeps: {
    include: [
      "react-markdown",
      "remark-gfm",
      "remark-math",
      "rehype-highlight",
      "rehype-katex",
      "jszip",
      "firebase/firestore",
    ],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks that rarely change, so an app deploy doesn't bust them.
        // Everything else (pages, modes, Markdown/highlight.js, KaTeX, Firestore, JSZip)
        // is split by the dynamic imports in App.tsx / lib/markdown.tsx / lib/firebase.ts.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/node_modules[\\/](@firebase[\\/](app|auth|util|component|logger)|firebase[\\/](app|auth))[\\/]/.test(id)) return "vendor-firebase-core";
          if (/node_modules[\\/](@firebase[\\/]database|firebase[\\/]database)[\\/]/.test(id)) return "vendor-firebase-rtdb";
          return undefined;
        },
      },
    },
  },
});
