import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed at the lofin.dev custom-domain root, so base is "/". Override with
// VITE_BASE at build time if you ever deploy under a GitHub Pages subpath instead
// (e.g. "/lofin/") — also update the matching segmentCount in public/404.html.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
