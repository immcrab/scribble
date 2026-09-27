import { test, expect, expectTouchTarget } from "./fixtures";

const CHATS = [
  {
    id: "c-one",
    title: "First chat",
    mode: "direct",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      { id: "u1", role: "user", content: "hello", createdAt: 1 },
      { id: "a1", role: "assistant", content: "hi there", createdAt: 2 },
    ],
  },
];

test.describe("Desktop sidebar", () => {
  test.use({ seed: { storage: { "lofin:chats": JSON.stringify(CHATS) } } });

  test("collapses and expands (button and Ctrl+\\)", async ({ page }) => {
    await page.goto("/c/c-one");
    const sb = page.getByTestId("sidebar");
    await expect(sb.getByText("History")).toBeVisible();
    const w0 = (await sb.boundingBox())!.width;
    await sb.getByTitle("Collapse sidebar").click();
    await expect.poll(async () => (await sb.boundingBox())!.width).toBeLessThan(100);
    await page.keyboard.press("Control+\\");
    await expect.poll(async () => (await sb.boundingBox())!.width).toBeCloseTo(w0, 0);
    // Never inert on desktop.
    await expect(sb).not.toHaveAttribute("inert", "");
  });

  test("More menu is a portaled popover with arrow-key navigation", async ({ page }) => {
    await page.goto("/c/c-one");
    await page.getByTestId("sidebar-more").click();
    const menu = page.getByRole("menu", { name: "More pages" });
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByTestId("sidebar-more")).toBeFocused();
  });
});

test.describe("Mobile sidebar", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, seed: { storage: { "lofin:chats": JSON.stringify(CHATS) } } });

  test("is inert when closed; opens as a modal drawer; Escape and backdrop close it", async ({ page }) => {
    await page.goto("/c/c-one");
    const sb = page.getByTestId("sidebar");
    await expect(sb).toHaveAttribute("inert", "");
    await expect(sb).toHaveAttribute("data-state", "closed");

    const open = page.getByTestId("open-sidebar");
    await open.tap();
    await expect(sb).toHaveAttribute("data-state", "open");
    await expect(sb).not.toHaveAttribute("inert", "");
    await expect(sb).toHaveAttribute("role", "dialog");
    await expect(sb).toHaveAttribute("aria-modal", "true");
    // Focus moved into the drawer.
    await expect.poll(() => sb.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Focus trap: tabbing a lot never leaves the drawer.
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await sb.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sb).toHaveAttribute("data-state", "closed");
    await expect(open).toBeFocused();

    await open.tap();
    await page.getByTestId("sidebar-backdrop").tap({ position: { x: 370, y: 400 } });
    await expect(sb).toHaveAttribute("data-state", "closed");
  });

  test("picking a chat closes the drawer", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("open-sidebar").tap();
    await page.getByTestId("sidebar").getByRole("button", { name: "First chat" }).tap();
    await expect(page.getByTestId("sidebar")).toHaveAttribute("data-state", "closed");
    await expect(page).toHaveURL(/\/c\/c-one$/);
  });

  test("primary controls meet touch-target size", async ({ page }) => {
    await page.goto("/");
    await expectTouchTarget(page, '[data-testid="open-sidebar"], [data-testid="mode-selector"], [data-testid="model-selector"]', 44);
    await expectTouchTarget(page, 'button[aria-label="Send message"]', 44);
    await page.getByTestId("mode-selector").tap();
    await expectTouchTarget(page, '[data-dropdown-menu] [role="menuitemradio"]', 44);
  });
});

test.describe("Keyboard & focus", () => {
  test("skip link jumps to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("focus ring is visible on keyboard focus", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-selector").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const outline = await page.getByTestId("mode-selector").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("Settings is a modal dialog: traps focus, Escape closes, focus returns", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("sidebar").getByRole("button", { name: "Settings" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("menus render above modal content (Settings pickers)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("sidebar").getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByRole("tab", { name: "Appearance" }).click();
    await dialog.getByTestId("font-picker").click();
    const menu = page.locator("[data-dropdown-menu]");
    await expect(menu).toBeVisible();
    // Sized to its trigger, and topmost where it's drawn.
    const [mb, tb] = [(await menu.boundingBox())!, (await dialog.getByTestId("font-picker").boundingBox())!];
    expect(Math.round(mb.width)).toBe(Math.round(tb.width));
    const topmost = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(24, r.height / 2));
      return !!hit && el.contains(hit);
    });
    expect(topmost).toBe(true);
    // Escape closes only the menu, not the whole Settings dialog.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(dialog).toBeVisible();
  });
});
