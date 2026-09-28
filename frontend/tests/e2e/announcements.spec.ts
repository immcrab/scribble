import { test, expect } from "./fixtures";

const announcement = {
  id: "e2e-announcement",
  title: "Test announcement",
  body: "This announcement should appear once.",
  publishedAt: 1_790_000_000_000,
};

test.describe("announcements", () => {
  test.use({
    seed: {
      settings: { announcementsEnabled: true },
      storage: { "lofin:catalog": JSON.stringify({ announcements: [announcement] }) },
    },
  });

  test("shows a new announcement once and remembers it after reload", async ({ page, gotoApp }) => {
    await gotoApp();

    const launch = page.getByRole("dialog", { name: "New announcement" });
    await expect(launch).toBeVisible();
    await expect(launch.getByText(announcement.title)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lofin:seen-announcements"))).toContain(announcement.id);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lofin:settings"))).toContain(announcement.id);

    await page.reload();
    await expect(launch).toBeHidden();
  });
});
