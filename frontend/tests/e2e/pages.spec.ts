import { test, expect, WORKER } from "./fixtures";

test.describe("Standalone pages", () => {
  test("Docs: index, a section, back to the app", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "Lofin Docs", level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/Docs|Lofin/);
    await page.getByRole("button", { name: /Model catalog/ }).first().click();
    await expect(page).toHaveURL(/\/docs\/models$/);
    await expect(page.getByRole("heading", { name: "Model catalog", level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Lofin Docs", level: 1 })).toBeVisible();
  });

  test("Docs: deep link to a section renders on a cold load", async ({ page }) => {
    await page.goto("/docs/models");
    await expect(page.getByRole("heading", { name: "Model catalog", level: 1 })).toBeVisible();
  });

  test("Connections renders", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
    await expect(page).toHaveTitle("Connections — Lofin");
  });

  test("Library: signed-out prompt, signed-in empty and error states", async ({ page, signIn }) => {
    await page.goto("/library");
    await expect(page.getByText("Sign in to see your saved generations and files.")).toBeVisible();

    let fail = true;
    await page.route(`${WORKER}/api/storage*`, (route) =>
      fail ? route.fulfill({ status: 500, json: { error: "Storage is unavailable." } }) : route.fulfill({ json: { items: [], cursor: null } })
    );
    await signIn();
    await expect(page.getByRole("alert")).toHaveText("Storage is unavailable.");
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  });

  test("Usage: signed-out gate, signed-in dashboard", async ({ page, signIn }) => {
    await page.goto("/usage");
    await expect(page.getByRole("heading", { name: "Sign in to see your usage" })).toBeVisible();
    await signIn({ email: "usage@example.test" });
    await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
    await expect(page.getByText("usage@example.test")).toBeVisible();
    await expect(page.getByText(/Qwen3\.8 Omni Flash — the free default model/)).toBeVisible();
  });

  test("Admin: signed-out, non-admin and admin views", async ({ page, signIn }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
    await expect(page.getByText(/Sign in as/)).toBeVisible();
    await signIn({ email: "someone@example.test" });
    await expect(page.getByText(/You're signed in as someone@example\.test/)).toBeVisible();
    // UI-only admin view; writes are still enforced by the RTDB rules server-side.
    await signIn({ email: "imcrabfr@gmail.com", emailVerified: true });
    await expect(page.getByRole("heading", { name: "Lofin admin" })).toBeVisible();
  });

  test("404 for unknown paths, and home recovers", async ({ page }) => {
    await page.goto("/definitely/not/a/page");
    await expect(page.getByRole("heading", { name: "Nothing lofind here yet" })).toBeVisible();
    await expect(page).toHaveTitle("Page not found — Lofin");
    await page.getByRole("button", { name: /Back to Lofin/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("Consent gate blocks the app until accepted", async ({ browser }) => {
    // Fresh context without the consent seed.
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.route((url) => !/^app\.lofin\.test$/.test(url.hostname), (r) => r.abort());
    await page.addInitScript(() => localStorage.setItem("lofin:human-verified-at", String(Date.now())));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Lofin" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    await context.close();
  });
});
