import { test, expect, WORKER } from "./fixtures";
import type { Page } from "@playwright/test";
import { PRODUCTION_SITE_KEY, QA_SITE_KEYS } from "../../src/lib/turnstileQa";

const DEV = "http://127.0.0.1:5199";

/** Serve the dev app under a real-looking HTTPS host (no DNS/TLS needed — Playwright fulfils it). */
async function serveAs(page: Page, origin: string) {
  await page.route(`${origin}/**`, async (route) => {
    const u = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: `${DEV}${u.pathname}${u.search}` });
      await route.fulfill({ response });
    } catch {
      // test already finished (late HMR/module request) — nothing to serve
    }
  });
}

/** Stand-in for Cloudflare's widget: records the site key it was rendered with and, like the
 * real test keys, passes for the "always pass" key and errors otherwise. */
async function stubTurnstile(page: Page) {
  await page.addInitScript((passKey) => {
    const w = window as unknown as { turnstile: unknown; __renderedSiteKeys: string[] };
    w.__renderedSiteKeys = [];
    w.turnstile = {
      render(_el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "error-callback": () => void }) {
        w.__renderedSiteKeys.push(opts.sitekey);
        setTimeout(() => (opts.sitekey === passKey ? opts.callback("XXXX.DUMMY.TOKEN.XXXX") : opts["error-callback"]()), 50);
        return "widget-1";
      },
      remove() {},
      reset() {},
    };
  }, QA_SITE_KEYS.pass);
}

const renderedKeys = (page: Page) => page.evaluate(() => (window as unknown as { __renderedSiteKeys: string[] }).__renderedSiteKeys);

test.describe("Turnstile staging QA mode", () => {
  test.use({ seed: { human: false } });

  test("staging host: ?turnstile_qa=pass swaps in the test key, shows a banner, and passes the gate", async ({ page }) => {
    let verifiedToken: unknown = null;
    await page.route(`${WORKER}/api/turnstile/verify`, async (route) => {
      verifiedToken = route.request().postDataJSON().token;
      await route.fulfill({ json: { ok: true } });
    });
    await serveAs(page, "https://staging.lofin.dev");
    await stubTurnstile(page);
    await page.goto("https://staging.lofin.dev/?turnstile_qa=pass");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(await renderedKeys(page)).toEqual([QA_SITE_KEYS.pass]);
    expect(verifiedToken).toBe("XXXX.DUMMY.TOKEN.XXXX");
    // Remembered for the tab.
    expect(await page.evaluate(() => sessionStorage.getItem("lofin:turnstile-qa"))).toBe("pass");
  });

  test("staging host: block mode shows the banner and never passes", async ({ page }) => {
    await serveAs(page, "https://staging.lofin.dev");
    await stubTurnstile(page);
    await page.goto("https://staging.lofin.dev/?turnstile_qa=block");
    await expect(page.getByTestId("turnstile-qa-banner")).toContainText('"block"');
    await expect(page.getByRole("heading", { name: "Verify you're human" })).toBeVisible();
    expect(await renderedKeys(page)).toEqual([QA_SITE_KEYS.block]);
  });

  for (const origin of ["https://lofin.dev", "https://www.lofin.dev", "https://ai.lofin.dev"]) {
    test(`production host ${origin}: the QA param is ignored`, async ({ page }) => {
      await serveAs(page, origin);
      await stubTurnstile(page);
      await page.goto(`${origin}/?turnstile_qa=pass`);
      await expect(page.getByRole("heading", { name: "Verify you're human" })).toBeVisible();
      await expect(page.getByTestId("turnstile-qa-banner")).toHaveCount(0);
      await expect.poll(() => renderedKeys(page)).toEqual([PRODUCTION_SITE_KEY]);
      expect(await page.evaluate(() => sessionStorage.getItem("lofin:turnstile-qa"))).toBeNull();
      // Even a pre-seeded session value can't turn it on.
      await page.evaluate(() => sessionStorage.setItem("lofin:turnstile-qa", "pass"));
      await page.reload();
      await expect.poll(() => renderedKeys(page)).toEqual([PRODUCTION_SITE_KEY]);
      await expect(page.getByTestId("turnstile-qa-banner")).toHaveCount(0);
    });
  }

  test("unlisted host: the QA param is ignored", async ({ page }) => {
    await stubTurnstile(page);
    await page.goto("/?turnstile_qa=pass");
    await expect(page.getByRole("heading", { name: "Verify you're human" })).toBeVisible();
    await expect.poll(() => renderedKeys(page)).toEqual([PRODUCTION_SITE_KEY]);
    await expect(page.getByTestId("turnstile-qa-banner")).toHaveCount(0);
  });
});
