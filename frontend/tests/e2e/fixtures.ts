import { test as base, expect, type Page, type Route } from "@playwright/test";

/** The Worker the app talks to by default (lib/storage.ts DEFAULT_WORKER_URL). */
export const WORKER = "https://ai.lofin.dev";

export type Seed = {
  /** Pre-pass the Turnstile site gate (HumanGate). Default true. */
  human?: boolean;
  /** Pre-accept the terms (ConsentGate). Default true. */
  consent?: boolean;
  /** Merged into lofin:settings on first load. */
  settings?: Record<string, unknown>;
  /** Raw localStorage entries written on first load. */
  storage?: Record<string, string>;
};

type ChatReply =
  | { kind: "stream"; text: string; delayMs?: number; reasoning?: string }
  | { kind: "error"; status: number; message: string }
  | { kind: "hang" };

export type Fixtures = {
  seed: Seed;
  /** Queue the next /api/chat/stream replies (consumed in order; last one repeats). */
  chatReplies: (replies: ChatReply[]) => void;
  /** Number of /api/chat/stream requests the app has made. */
  chatRequests: () => number;
  signIn: (user?: Partial<{ uid: string; email: string; displayName: string; emailVerified: boolean }>) => Promise<void>;
  gotoApp: (path?: string) => Promise<void>;
};

const DEFAULT_SETTINGS = {
  autoRetryRateLimited: false,
  locationConsent: "denied",
  announcementsEnabled: false,
};

export const test = base.extend<Fixtures>({
  seed: [{}, { option: true }],

  page: async ({ page, seed }, use) => {
    // Hermetic: only the app's own origin may load. Firebase, ads, fonts, Puter, … are
    // aborted; the Worker API is mocked below (later routes take precedence).
    await page.context().route(
      (url) => !/^(app\.lofin\.test|localhost|127\.0\.0\.1)$/.test(url.hostname),
      (route) => route.abort()
    );
    // HTTP routes don't cover WebSockets: Firebase RTDB would otherwise stream the live
    // admin catalog (hidden/added models, announcements) into the test.
    await page.context().routeWebSocket(
      (url) => !/^(app\.lofin\.test|localhost|127\.0\.0\.1)$/.test(url.hostname),
      (ws) => ws.close()
    );
    await page.route(`${WORKER}/api/**`, (route) => route.fulfill({ status: 404, json: { error: "not mocked" } }));
    await page.route(`${WORKER}/api/health`, (route) => route.fulfill({ json: { ok: true } }));
    await page.route(`${WORKER}/api/chat/title`, (route) => route.fulfill({ json: { title: "Mocked title" } }));

    const init = {
      human: seed.human !== false,
      consent: seed.consent !== false,
      settings: { ...DEFAULT_SETTINGS, ...(seed.settings ?? {}) },
      storage: seed.storage ?? {},
    };
    await page.addInitScript((s) => {
      // Seed once per tab; reloads keep whatever the test changed since.
      if (sessionStorage.getItem("e2e:seeded")) return;
      sessionStorage.setItem("e2e:seeded", "1");
      if (s.human) localStorage.setItem("lofin:human-verified-at", String(Date.now()));
      if (s.consent) localStorage.setItem("lofin:consent", "1");
      localStorage.setItem("lofin:pwa-dismissed", String(Date.now()));
      const prev = JSON.parse(localStorage.getItem("lofin:settings") || "{}");
      localStorage.setItem("lofin:settings", JSON.stringify({ ...prev, ...s.settings }));
      for (const [k, v] of Object.entries(s.storage)) localStorage.setItem(k, v as string);
    }, init);
    await use(page);
  },

  chatReplies: async ({ page }, use) => {
    let queue: ChatReply[] = [{ kind: "stream", text: "Hello from the mock." }];
    const state = { count: 0 };
    (page as Page & { __chatState?: typeof state }).__chatState = state;
    await page.route(`${WORKER}/api/chat/stream`, async (route: Route) => {
      state.count++;
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      if (reply.kind === "hang") return; // never fulfilled — the app aborts it
      if (reply.kind === "error") {
        await route.fulfill({ status: reply.status, json: { error: reply.message } });
        return;
      }
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      const lines: string[] = [];
      if (reply.reasoning) lines.push(JSON.stringify({ reasoning: reply.reasoning }));
      // Split into a few deltas so the client exercises its incremental path.
      const parts = reply.text.match(/[\s\S]{1,24}/g) ?? [""];
      for (const p of parts) lines.push(JSON.stringify({ delta: p }));
      lines.push(JSON.stringify({ done: true }));
      await route
        .fulfill({ status: 200, headers: { "content-type": "application/x-ndjson" }, body: lines.join("\n") + "\n" })
        .catch(() => {});
    });
    await use((replies) => {
      queue = [...replies];
    });
  },

  chatRequests: async ({ page, chatReplies: _ensureRoute }, use) => {
    await use(() => (page as Page & { __chatState?: { count: number } }).__chatState?.count ?? 0);
  },

  signIn: async ({ page }, use) => {
    await use(async (user) => {
      await page.waitForFunction(() => !!(window as unknown as { __lofinE2E?: unknown }).__lofinE2E);
      await page.evaluate((u) => {
        (window as unknown as { __lofinE2E: { setUser: (u: unknown) => void } }).__lofinE2E.setUser({
          uid: "e2e-user",
          email: "tester@example.test",
          displayName: "E2E Tester",
          emailVerified: true,
          ...u,
        });
      }, user ?? {});
    });
  },

  gotoApp: async ({ page }, use) => {
    await use(async (path = "/") => {
      await page.goto(path);
      await expect(page.getByRole("textbox", { name: "Message" }).or(page.locator("h1")).first()).toBeVisible();
    });
  },
});

export { expect };

/** Minimum comfortable touch target (WCAG 2.5.5 AAA is 44px; 2.5.8 AA minimum is 24px). */
export async function expectTouchTarget(page: Page, selector: string, min = 40) {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) };
      })
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect.soft(Math.round(Math.min(b.w, b.h)), `touch target "${b.label}" is ${Math.round(b.w)}x${Math.round(b.h)}`).toBeGreaterThanOrEqual(min);
  }
}
