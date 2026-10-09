import { test, expect } from "./fixtures";

/**
 * Regression: on narrow viewports the ModeSelector menu overlapped the empty-state
 * suggestion cards but sat *under* them for hit-testing, so tapping the visible "Image"
 * option clicked "Build a dashboard" instead. The menu now renders in a portal on the
 * popover layer, and on mobile widths a backdrop swallows the dismissing tap.
 */
for (const width of [390, 572]) {
  test.describe(`ModeSelector at ${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true });

    test("menu is the topmost element where its options are drawn", async ({ page, gotoApp }) => {
      await gotoApp("/");
      await expect(page.getByRole("button", { name: "Build a dashboard" })).toBeVisible();
      await page.getByTestId("mode-selector").click();
      const menu = page.getByRole("menu", { name: "Choose mode" });
      await expect(menu).toBeVisible();

      // Every option's centre point must hit-test to that option (not a card beneath it).
      for (const id of ["battle", "agent", "side-by-side", "image", "speech", "direct"]) {
        const opt = page.getByTestId(`mode-option-${id}`);
        await expect(opt).toBeVisible();
        const hit = await opt.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && el.contains(top);
        });
        expect(hit, `option ${id} is covered by other content`).toBe(true);
      }

      // The menu stays inside the viewport.
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    });

    test("tapping Image selects Image mode and does not start a suggestion", async ({ page, gotoApp, signIn, chatRequests }) => {
      await gotoApp("/");
      // Image is a signed-in mode; signed out, the tap opens Google sign-in instead.
      await signIn();
      await page.getByTestId("mode-selector").tap();
      await page.getByTestId("mode-option-image").tap();
      await expect(page.getByRole("menu", { name: "Choose mode" })).toBeHidden();
      await expect(page.getByTestId("mode-selector")).toHaveAccessibleName(/Mode: Image/);
      // A click-through would have sent the "Build a dashboard" prompt as a new chat.
      await expect(page.getByText("Help me design a dashboard layout")).toHaveCount(0);
      expect(chatRequests()).toBe(0);
    });

    test("tapping outside dismisses without activating what's underneath", async ({ page, gotoApp, chatRequests }) => {
      await gotoApp("/");
      await page.getByTestId("mode-selector").tap();
      await expect(page.getByRole("menu", { name: "Choose mode" })).toBeVisible();
      const card = page.getByRole("button", { name: /Launch a storefront/ });
      const cb = (await card.boundingBox())!;
      // Tap a card that is visible outside the menu.
      await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
      await expect(page.getByRole("menu", { name: "Choose mode" })).toBeHidden();
      await expect(page.getByText("Outline the steps to launch a small online storefront")).toHaveCount(0);
      expect(chatRequests()).toBe(0);
    });
  });
}

test.describe("ModeSelector keyboard", () => {
  test("arrow keys, Escape restores focus to trigger, Tab is trapped", async ({ page, gotoApp }) => {
    await gotoApp("/");
    const trigger = page.getByTestId("mode-selector");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Choose mode" });
    await expect(menu).toBeVisible();
    // Focus lands on the checked option (Direct).
    await expect(page.getByTestId("mode-option-direct")).toBeFocused();
    await page.keyboard.press("ArrowDown"); // wraps to first
    await expect(page.getByTestId("mode-option-battle")).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByTestId("mode-option-direct")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("mode-option-speech")).toBeFocused();
    await page.keyboard.press("Tab"); // last → wraps to first (trap)
    await expect(menu.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
