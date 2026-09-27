import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

function chat(id: string, title: string, text: string, updatedAt: number) {
  return {
    id,
    title,
    mode: "direct",
    createdAt: updatedAt,
    updatedAt,
    modelId: "qwen/qwen3.8-omni-flash:free",
    messages: [
      { id: `${id}-u`, role: "user", content: text, createdAt: updatedAt },
      { id: `${id}-a`, role: "assistant", content: `Reply about ${text}`, createdAt: updatedAt + 1 },
    ],
  };
}

const CHATS = [chat("c-alpha", "Alpha planning", "rocket engines", 3), chat("c-beta", "Beta notes", "banana bread", 2)];

async function sidebar(page: Page) {
  return page.getByTestId("sidebar");
}

test.describe("Chat & project CRUD", () => {
  test.use({ seed: { storage: { "lofin:chats": JSON.stringify(CHATS) } } });

  test("open, rename and delete a chat", async ({ page }) => {
    await page.goto("/c/c-alpha");
    const sb = await sidebar(page);
    await expect(sb.getByRole("button", { name: "Alpha planning" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main").getByText("Reply about rocket engines")).toBeVisible();

    await sb.getByRole("button", { name: "Beta notes" }).click();
    await expect(page).toHaveURL(/\/c\/c-beta$/);

    // Rename
    const row = sb.getByTestId("chat-row").filter({ hasText: "Beta notes" }).locator("..");
    await row.hover();
    await row.getByTitle("Rename").click();
    const input = sb.locator("input:not([type=search])").first();
    await input.fill("Beta renamed");
    await input.press("Enter");
    await expect(sb.getByRole("button", { name: "Beta renamed" })).toBeVisible();

    // Delete needs a confirm
    const row2 = sb.getByTestId("chat-row").filter({ hasText: "Beta renamed" }).locator("..");
    await row2.hover();
    await row2.getByTitle("Delete").click();
    await row2.getByTitle("Confirm delete").click();
    await expect(sb.getByRole("button", { name: "Beta renamed" })).toHaveCount(0);
    // Persisted
    await page.reload();
    await expect(page.getByTestId("sidebar").getByRole("button", { name: "Beta renamed" })).toHaveCount(0);
  });

  test("search filters by title and message body", async ({ page }) => {
    await page.goto("/c/c-alpha");
    const sb = await sidebar(page);
    const search = sb.getByTestId("chat-search");
    await search.fill("banana");
    await expect(sb.getByText("1 result")).toBeVisible();
    await expect(sb.getByTestId("chat-row")).toHaveCount(1);
    await expect(sb.getByTestId("chat-row")).toContainText("Beta notes");
    await search.fill("nothing-matches");
    await expect(sb.getByText('No chats match "nothing-matches"')).toBeVisible();
    await sb.getByTitle("Clear search").click();
    await expect(sb.getByTestId("chat-row").first()).toBeVisible();
  });

  test("create, rename and delete a project; move a chat into it", async ({ page }) => {
    await page.goto("/c/c-alpha");
    const sb = await sidebar(page);
    await sb.getByTitle("New project").click();
    await sb.getByPlaceholder("Project name").fill("Launch");
    await sb.getByPlaceholder("Project name").press("Enter");
    await expect(sb.getByText("Launch")).toBeVisible();

    // Move "Alpha planning" into it via the per-row menu (a portaled Dropdown).
    const row = sb.getByTestId("chat-row").filter({ hasText: "Alpha planning" }).locator("..");
    await row.hover();
    await row.getByTitle("Add to project").click();
    await page.getByRole("dialog").getByRole("button", { name: "Launch" }).click();
    await expect(sb.getByTestId("chat-row").filter({ hasText: "Alpha planning" })).toHaveCount(0);

    // Open the project: its URL and header.
    await sb.getByRole("button", { name: "Launch", exact: true }).click();
    await expect(page).toHaveURL(/\/p\/[^/]+$/);
    await expect(page.getByRole("main").getByTitle("Rename project")).toHaveText("Launch");
    await expect(page.getByRole("main").getByText("1 chat", { exact: true })).toBeVisible();

    // Rename from the project header.
    await page.getByRole("main").getByTitle("Rename project").click();
    const nameInput = page.getByRole("main").locator("input").first();
    await nameInput.fill("Launch v2");
    await nameInput.press("Enter");
    await expect(sb.getByRole("button", { name: "Launch v2", exact: true })).toBeVisible();

    // Delete (with confirm) — its chats go back to History.
    const prow = sb.getByRole("button", { name: "Launch v2", exact: true }).locator("..");
    await prow.hover();
    await prow.getByTitle("Delete project (keeps its chats)").click();
    await prow.getByTitle("Confirm delete project (keeps its chats)").click();
    await expect(sb.getByRole("button", { name: "Launch v2", exact: true })).toHaveCount(0);
    await expect(sb.getByTestId("chat-row").filter({ hasText: "Alpha planning" })).toHaveCount(1);
  });
});

test.describe("Export & share", () => {
  test.use({ seed: { storage: { "lofin:chats": JSON.stringify(CHATS) } } });

  test("exports Markdown and JSON, copies transcript", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/c/c-alpha");
    const sb = page.getByTestId("sidebar");

    await sb.getByTitle("Export chat").click();
    const menu = page.getByRole("menu", { name: "Export format" });
    await expect(menu).toBeVisible();
    const [md] = await Promise.all([page.waitForEvent("download"), menu.getByRole("menuitem", { name: "Markdown (.md)" }).click()]);
    expect(md.suggestedFilename()).toBe("alpha_planning.md");
    const mdText = await (await md.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    expect(mdText).toContain("rocket engines");

    await sb.getByTitle("Export chat").click();
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "JSON (.json)" }).click()]);
    const parsed = JSON.parse(await (await json.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
    expect(parsed.messages).toHaveLength(2);

    await sb.getByRole("button", { name: "Copy transcript to clipboard" }).click();
    await expect(sb.getByTestId("export-status")).toHaveText("Transcript copied to clipboard.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("rocket engines");
  });

  test("Share is signed-in only and copies the public link", async ({ page, context, signIn }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/c/c-alpha");
    const sb = page.getByTestId("sidebar");
    await expect(sb.getByRole("button", { name: "Copy a public link to this chat" })).toHaveCount(0);
    await signIn();
    await sb.getByRole("button", { name: "Copy a public link to this chat" }).click();
    await expect(sb.getByTestId("export-status")).toContainText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/c\/c-alpha$/);
  });
});
