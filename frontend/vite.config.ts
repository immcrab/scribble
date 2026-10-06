import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

// Deployed at the lofin.dev custom-domain root, so base is "/". Override with
// VITE_BASE at build time if you ever deploy under a GitHub Pages subpath instead
// (e.g. "/lofin/") — also update the matching segmentCount in public/404.html.
export default defineConfig({
  plugins: [
    react(),
    configureSpa404(),
    // Vite warns for an unset %VITE_*% HTML replacement. This token has a
    // stable app-build default while preserving the docs deployment's opt-in.
    {
      name: "lofin-docs-static-fallback",
      transformIndexHtml(html) {
        return html.replace("__LOFIN_DOCS_SITE__", process.env.VITE_DOCS_SITE === "true" ? "true" : "false");
      },
    },
  ],
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
