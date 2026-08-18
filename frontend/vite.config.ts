import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path matches the GitHub Pages repo name. Override with VITE_BASE at build time
// if deploying to a different path (e.g. a custom domain uses "/").
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/scribble/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
