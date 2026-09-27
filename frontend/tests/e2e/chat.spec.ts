import { test, expect } from "./fixtures";

const MARKDOWN = [
  "# Plan",
  "",
  "Here is **bold** and a list:",
  "",
  "- first item",
  "- second item",
  "",
  // A one-line, non-web snippet stays inline (longer/web code moves to the artifact panel).
  "```python",
  'print("answer", 42)',
  "```",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
].join("\n");

async function send(page: import("@playwright/test").Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

test.describe("Direct chat", () => {
  test("streams a reply and renders Markdown (headings, lists, code, tables)", async ({ page, gotoApp, chatReplies }) => {
    chatReplies([{ kind: "stream", text: MARKDOWN }]);
    await gotoApp("/");
    await send(page, "Make me a plan");

    await expect(page.getByRole("main").getByText("Make me a plan", { exact: true })).toBeVisible();
    // URL moves off "/" to the chat's own address once it has a message.
    await expect(page).toHaveURL(/\/c\/[^/]+$/);

    const reply = page.locator(".prose-lofin").last();
    await expect(reply.getByRole("heading", { name: "Plan" })).toBeVisible();
    await expect(reply.locator("strong", { hasText: "bold" })).toBeVisible();
    await expect(reply.getByRole("listitem")).toHaveCount(2);
    await expect(reply.locator(".code-block-wrapper pre")).toContainText('print("answer", 42)');
    // Syntax highlighting applied (rehype-highlight adds hljs token spans).
    await expect(reply.locator(".code-block-wrapper .hljs-string").first()).toBeVisible();
    await expect(reply.getByRole("table")).toBeVisible();
    await expect(reply.getByRole("button", { name: "Copy code" })).toBeVisible();
    // Streaming finished: Send is back.
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  });

  test("Stop aborts an in-flight reply and returns to idle", async ({ page, gotoApp, chatReplies }) => {
    chatReplies([{ kind: "hang" }]);
    await gotoApp("/");
    await send(page, "Tell me a long story");
    const stop = page.getByRole("button", { name: "Stop generating" });
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(stop).toBeHidden();
    await expect(page.locator(".stream-cursor")).toHaveCount(0);
  });

  test("shows an error with Retry, and Retry re-sends successfully", async ({ page, gotoApp, chatReplies, chatRequests }) => {
    chatReplies([
      { kind: "error", status: 400, message: "Model rejected the request: bad parameter" },
      { kind: "stream", text: "Recovered **fine**." },
    ]);
    await gotoApp("/");
    await send(page, "Trigger an error");

    const err = page.getByTestId("message-error");
    await expect(err).toBeVisible();
    await expect(err).toContainText("bad parameter");
    await expect(err).toHaveAttribute("role", "alert");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator(".prose-lofin strong", { hasText: "fine" })).toBeVisible();
    await expect(page.getByTestId("message-error")).toHaveCount(0);
    expect(chatRequests()).toBe(2);
  });

  test("first render of the compose screen does not load the Markdown/KaTeX chunks", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname);
    });
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    // Captured synchronously at first paint: heavy routes are split out.
    const early = [...scripts];
    for (const heavy of ["/src/pages/DocsPage.tsx", "/src/pages/AdminPage.tsx", "/src/pages/TutorPage.tsx", "/src/modes/ImageMode.tsx", "/src/lib/markdown/math.ts"]) {
      expect(early, `${heavy} should be lazy`).not.toContain(heavy);
    }
  });
});
