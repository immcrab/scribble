import { chromium, type FullConfig } from "@playwright/test";

/**
 * The Vite dev server compiles modules on first request, and every lazily loaded page is
 * its own module graph. Visiting each route once up front means the parallel tests don't
 * all pay (and time out on) that cold compile at the same moment.
 */
export default async function globalSetup(config: FullConfig) {
  const project = config.projects.find((p) => p.name === "chromium");
  if (!project) return;
  const { baseURL, launchOptions, channel } = project.use;
  const browser = await chromium.launch({ ...launchOptions, channel });
  const page = await browser.newPage({ baseURL });
  await page.context().route((url) => !/^(app\.lofin\.test|127\.0\.0\.1|localhost)$/.test(url.hostname), (r) => r.abort());
  await page.context().routeWebSocket((url) => !/^(app\.lofin\.test|127\.0\.0\.1|localhost)$/.test(url.hostname), (ws) => ws.close());
  await page.addInitScript(() => {
    localStorage.setItem("lofin:human-verified-at", String(Date.now()));
    localStorage.setItem("lofin:consent", "1");
  });
  for (const path of ["/", "/docs", "/tutor", "/admin", "/usage", "/library", "/connections", "/nope-404"]) {
    await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 }).catch(() => {});
  }
  // Pull in the remaining lazy chunks (modes, Markdown, KaTeX, Settings, Firestore, JSZip).
  await page.goto("/", { waitUntil: "networkidle" }).catch(() => {});
  await page
    .evaluate(() =>
      Promise.allSettled(
        [
          "/src/modes/BattleMode.tsx",
          "/src/modes/AgentMode.tsx",
          "/src/modes/SideBySideMode.tsx",
          "/src/modes/ImageMode.tsx",
          "/src/modes/SpeechMode.tsx",
          "/src/components/SettingsModal.tsx",
          "/src/lib/markdown/Renderer.tsx",
          "/src/lib/markdown/math.ts",
        ].map((p) => import(/* @vite-ignore */ p))
      )
    )
    .catch(() => {});
  await browser.close();
}
