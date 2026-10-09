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

async function imageGenerationBuddyMotion(page: Page) {
  return page.evaluate(() => {
    const scene = document.createElement("div");
    scene.className = "imggen-scene";
    const buddy = document.createElement("div");
    buddy.className = "imggen-buddy";
    scene.appendChild(buddy);
    document.body.appendChild(scene);
    const style = getComputedStyle(buddy);
    const result = {
      duration: parseFloat(style.animationDuration) * (style.animationDuration.endsWith("ms") ? 1 : 1000),
      iterations: style.animationIterationCount,
    };
    scene.remove();
    return result;
  });
}

test.describe("Reduced motion", () => {
  test("Settings opens as a wider pop-and-stretch panel and respects reduced motion", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("sidebar").getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    // clientWidth is stable while the entry animation is still scaling the
    // visual bounding box.
    expect(await dialog.evaluate((el) => el.clientWidth)).toBeGreaterThanOrEqual(850);
    expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe("settings-pop-stretch-in");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("sidebar").getByRole("button", { name: "Settings" }).click();
    await expect(dialog).toBeVisible();
    const duration = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000)).toBeLessThan(1);
  });

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
    const buddy = await imageGenerationBuddyMotion(page);
    expect(buddy.duration).toBeGreaterThan(5_000);
    expect(buddy.iterations).toBe("infinite");
  });

  test("in-app Reduce Motion setting applies app-wide, including portaled menus, and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("sidebar").getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByRole("tab", { name: "Appearance" }).click();
    const toggle = dialog.getByRole("switch", { name: /Reduce motion/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    await expect(page.locator("html")).toHaveClass(/motion-reduce-force/);
    await expectReduced(page);
    const buddy = await imageGenerationBuddyMotion(page);
    expect(buddy.duration).toBeGreaterThan(5_000);
    expect(buddy.iterations).toBe("infinite");

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
