import { test, expect, expectTouchTarget } from "./fixtures";

const DEFAULT_KEY = "xkiro:qwen/qwen3.8-omni-flash:free";

async function openPicker(page: import("@playwright/test").Page) {
  await page.getByTestId("model-selector").click();
  const dialog = page.getByRole("dialog", { name: "Choose a model" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function optionKeys(dialog: import("@playwright/test").Locator) {
  return dialog.getByTestId("model-option").evaluateAll((els) => els.map((e) => e.getAttribute("data-model-key")!));
}

test.describe("Model picker", () => {
  test("lists every model exactly once, grouped by provider", async ({ page, gotoApp }) => {
    await gotoApp("/");
    const dialog = await openPicker(page);
    const keys = await optionKeys(dialog);
    expect(keys.length).toBeGreaterThan(10);
    expect(new Set(keys).size).toBe(keys.length);
    await expect(dialog.getByRole("group", { name: "xKiro" })).toBeVisible();
  });

  test("search narrows the list and shows an empty state", async ({ page, gotoApp }) => {
    await gotoApp("/");
    const dialog = await openPicker(page);
    const search = dialog.getByTestId("model-search");
    await expect(search).toBeFocused();
    await search.fill("qwen max");
    const keys = await optionKeys(dialog);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.toLowerCase()).toMatch(/qwen.*max/);
    await search.fill("zzzz-no-such-model");
    await expect(dialog.getByRole("status")).toContainText('No models match "zzzz-no-such-model"');
    // ArrowDown from the search box moves into the rows.
    await search.fill("qwen");
    await search.press("ArrowDown");
    await expect(dialog.getByTestId("model-option").first()).toBeFocused();
  });

  test("capability filters and badges distinguish free, gated, vision, code, reasoning", async ({ page, gotoApp }) => {
    await gotoApp("/");
    const dialog = await openPicker(page);

    // Signed out: only the default is usable without signing in.
    await dialog.getByTestId("model-filter-open").click();
    await expect(dialog.getByTestId("model-filter-open")).toHaveAttribute("aria-pressed", "true");
    expect(await optionKeys(dialog)).toEqual([DEFAULT_KEY]);
    const def = dialog.locator(`[data-model-key="${DEFAULT_KEY}"]`);
    await expect(def.getByText("Free")).toBeVisible();
    await dialog.getByTestId("model-filter-open").click();

    // Gated models carry a "Sign in" badge while signed out.
    await expect(dialog.getByText("Sign in", { exact: true }).first()).toBeVisible();

    await dialog.getByTestId("model-filter-vision").click();
    for (const row of await dialog.getByTestId("model-option").all()) await expect(row.getByText("Vision", { exact: true })).toBeVisible();
    await dialog.getByTestId("model-filter-vision").click();

    await dialog.getByTestId("model-filter-reasoning").click();
    for (const row of await dialog.getByTestId("model-option").all()) await expect(row.getByText("Reasoning", { exact: true })).toBeVisible();
    await dialog.getByTestId("model-filter-reasoning").click();

    await dialog.getByTestId("model-filter-code").click();
    const codeRows = await dialog.getByTestId("model-option").all();
    expect(codeRows.length).toBeGreaterThan(0);
    for (const row of codeRows) await expect(row.getByText("Code", { exact: true })).toBeVisible();
  });

  test("signed out: picking a gated model does not switch to it", async ({ page, gotoApp }) => {
    await gotoApp("/");
    const dialog = await openPicker(page);
    const gated = dialog.getByTestId("model-option").filter({ hasText: "Sign in" }).first();
    await gated.click();
    await expect(page.getByTestId("model-selector")).toHaveAccessibleName(/Qwen3\.8 Omni Flash/);
  });

  test("signed in: select, then favorites and recents are pinned without duplicates", async ({ page, gotoApp, signIn }) => {
    await gotoApp("/");
    await signIn();
    let dialog = await openPicker(page);
    await expect(dialog.getByText("Sign in", { exact: true })).toHaveCount(0);

    await dialog.getByTestId("model-search").fill("Qwen3.7 Max");
    await dialog.getByTestId("model-option").first().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("model-selector")).toHaveAccessibleName(/Qwen3\.7 Max/);

    dialog = await openPicker(page);
    const recent = dialog.getByRole("group", { name: "Recent" });
    await expect(recent.getByTestId("model-option")).toHaveCount(1);
    await expect(recent.getByTestId("model-option")).toHaveAttribute("aria-current", "true");

    // Star another model — it moves to Favorites and out of its provider group.
    await dialog.getByRole("button", { name: "Add Qwen3.6 Plus to favorites" }).click();
    const favs = dialog.getByRole("group", { name: "Favorites" });
    await expect(favs.getByTestId("model-option")).toHaveCount(1);
    const keys = await optionKeys(dialog);
    expect(new Set(keys).size).toBe(keys.length);

    // Persists across reloads.
    await page.reload();
    await signIn();
    dialog = await openPicker(page);
    await expect(dialog.getByRole("group", { name: "Favorites" }).getByText("Qwen3.6 Plus")).toBeVisible();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("presents as a bottom sheet with comfortable touch targets", async ({ page, gotoApp }) => {
      await gotoApp("/");
      const dialog = await openPicker(page);
      const box = (await dialog.boundingBox())!;
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.width)).toBe(390);
      expect(Math.round(box.y + box.height)).toBe(844);
      await expectTouchTarget(page, '[data-dropdown-menu] [data-testid="model-option"]', 44);
      // The backdrop dismisses without touching the page beneath.
      await page.getByTestId("dropdown-backdrop").click({ position: { x: 20, y: 20 } });
      await expect(dialog).toBeHidden();
    });
  });
});
