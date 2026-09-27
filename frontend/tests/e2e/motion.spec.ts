import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/** Computed animation/transition timings for a probe element with the given classes. */
async function probe(page: Page, className: string) {
  return page.evaluate((cls) => {
    const el = document.createElement("div");
    el.className = cls;
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = { animation: parseFloat(cs.animationDuration) * (cs.animationDuration.endsWith("ms") ? 1 : 1000), transition: parseFloat(cs.transitionDuration) * (cs.transitionDuration.endsWith("ms") ? 1 : 1000) };
    el.remove();
    return out;
  }, className);
}

async function expectReduced(page: Page) {
  // Decorative entrance animations and transitions are effectively instant…
  expect((await probe(page, "animate-fade-in-up")).animation).toBeLessThan(1);
  expect((await probe(page, "transition-colors duration-300")).transition).toBeLessThan(1);
  // …but loading spinners keep turning (slower) so "still working" feedback isn't lost.
  expect((await probe(page, "animate-spin")).animation).toBeGreaterThan(500);
}

test.describe("Reduced motion", () => {
  test("baseline: animations run normally", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect((await probe(page, "animate-fade-in-up")).animation).toBeGreaterThan(100);
  });

  test("honours prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expectReduced(page);
  });

  test("in-app Reduce Motion setting applies app-wide, including portaled menus, and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("sidebar").getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    const toggle = dialog.getByRole("switch", { name: /Reduce motion/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    await expect(page.locator("html")).toHaveClass(/motion-reduce-force/);
    await expectReduced(page);

    // A menu portaled to <body> is covered too.
    await page.getByTestId("mode-selector").click();
    const menu = page.locator("[data-dropdown-menu]");
    await expect(menu).toBeVisible();
    const dur = await menu.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(dur) * (dur.endsWith("ms") ? 1 : 1000)).toBeLessThan(1);
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/motion-reduce-force/);
  });

  test("essential feedback survives reduced motion: streaming state and Stop", async ({ page, chatReplies }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    chatReplies([{ kind: "hang" }]);
    await page.goto("/");
    await page.getByRole("textbox", { name: "Message" }).fill("hi");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
    await page.getByRole("button", { name: "Stop generating" }).click();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  });
});
