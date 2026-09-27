import { test, expect, WORKER } from "./fixtures";
import type { Page } from "@playwright/test";

// 1×1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function pickMode(page: Page, id: string) {
  await page.getByTestId("mode-selector").click();
  await page.getByTestId(`mode-option-${id}`).click();
}

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

test.describe("Signed-out locked states", () => {
  test("gated modes show a lock and don't switch", async ({ page, gotoApp }) => {
    await gotoApp("/");
    await page.getByTestId("mode-selector").click();
    for (const id of ["battle", "agent", "side-by-side"]) {
      await expect(page.getByTestId(`mode-option-${id}`).getByText("Sign in to unlock")).toBeVisible();
    }
    await expect(page.getByTestId("mode-option-image").getByText("Sign in to unlock")).toHaveCount(0);
    await page.getByTestId("mode-option-battle").click();
    await expect(page.getByTestId("mode-selector")).toHaveAccessibleName(/Mode: Direct/);
  });
});

test.describe("Signed-in modes", () => {
  test.beforeEach(async ({ gotoApp, signIn }) => {
    await gotoApp("/");
    await signIn();
  });

  test("Battle: two anonymous replies, then vote", async ({ page, chatReplies }) => {
    chatReplies([{ kind: "stream", text: "Answer from a hidden model." }]);
    await pickMode(page, "battle");
    await expect(page.getByRole("heading", { name: "Battle two anonymous models" })).toBeVisible();
    await send(page, "Which is better, tabs or spaces?");
    await expect(page.getByText("Answer from a hidden model.")).toHaveCount(2);
    await page.getByRole("button", { name: "Left is better" }).click();
    await expect(page.getByRole("button", { name: "Left is better" })).toBeVisible();
  });

  test("Agent: sends a task and renders the reply", async ({ page, chatReplies }) => {
    chatReplies([{ kind: "stream", text: "Task **done**." }]);
    await pickMode(page, "agent");
    await expect(page.getByRole("heading", { name: "What would you like Lofin to do?" })).toBeVisible();
    await page.getByRole("textbox", { name: "Message" }).fill("Plan a trip");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".prose-lofin strong", { hasText: "done" })).toBeVisible();
  });

  test("Side by Side: two pickers, two replies", async ({ page, chatReplies }) => {
    chatReplies([{ kind: "stream", text: "Side reply." }]);
    await pickMode(page, "side-by-side");
    await expect(page.getByRole("heading", { name: "Compare two models you choose" })).toBeVisible();
    await expect(page.getByTestId("model-selector")).toHaveCount(2);
    await send(page, "Compare these");
    await expect(page.getByText("Side reply.")).toHaveCount(2);
  });
});

test.describe("Image mode", () => {
  test("generates an image from a prompt (mocked Worker)", async ({ page, gotoApp }) => {
    let body: Record<string, unknown> | null = null;
    await page.route(`${WORKER}/api/image/generate`, async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { dataUrl: PNG } });
    });
    await gotoApp("/");
    await pickMode(page, "image");
    await expect(page.getByRole("heading", { name: /Make a direction/ })).toBeVisible();
    await page.getByPlaceholder("Describe the image you want...").fill("a red fox in snow");
    await page.getByPlaceholder("Describe the image you want...").press("Enter");
    await expect(page.locator('img[src^="data:image"]').first()).toBeVisible({ timeout: 10_000 });
    expect(body).not.toBeNull();
    expect(String(body!.prompt)).toContain("a red fox in snow");
  });

  test("surfaces a generation error", async ({ page, gotoApp }) => {
    await page.route(`${WORKER}/api/image/generate`, (route) => route.fulfill({ status: 400, json: { error: "Prompt was rejected by the image model." } }));
    await gotoApp("/");
    await pickMode(page, "image");
    await page.getByPlaceholder("Describe the image you want...").fill("something");
    await page.getByPlaceholder("Describe the image you want...").press("Enter");
    await expect(page.getByText("Prompt was rejected by the image model.")).toBeVisible();
  });
});

test.describe("Speech mode", () => {
  const chat = {
    id: "speech-chat-1",
    title: "Speech test",
    mode: "speech",
    createdAt: 1,
    updatedAt: 1,
    messages: [],
  };
  test.use({ seed: { storage: { "lofin:chats": JSON.stringify([chat]) } } });

  test("signed out: asks the user to sign in instead of calling the Worker", async ({ page }) => {
    let called = false;
    await page.route(`${WORKER}/api/speech/voices`, (route) => route.fulfill({ json: { voices: [{ id: "alloy", name: "Alloy" }] } }));
    await page.route(`${WORKER}/api/speech/generate`, (route) => {
      called = true;
      return route.fulfill({ json: { dataUrl: "data:audio/mp3;base64,AA==" } });
    });
    await page.goto("/c/speech-chat-1");
    await expect(page.getByRole("heading", { name: "What should we say?" })).toBeVisible();
    await page.getByPlaceholder(/Type or paste the text to speak/).fill("Hello there");
    await page.getByTitle("Generate speech").click();
    await expect(page.getByText("Sign in to generate speech.")).toBeVisible();
    expect(called).toBe(false);
  });
});

test.describe("Tutor", () => {
  test("renders, sends a message, and lazy-loads KaTeX for math", async ({ page, chatReplies }) => {
    chatReplies([{ kind: "stream", text: "The area is $$A = \\pi r^2$$ for a circle." }]);
    const katexRequests: string[] = [];
    page.on("request", (r) => r.url().includes("markdown/math") && katexRequests.push(r.url()));
    await page.goto("/tutor");
    await expect(page.getByRole("heading", { name: "Tutor" })).toBeVisible();
    expect(katexRequests).toHaveLength(0);
    await page.getByRole("textbox", { name: "Message" }).fill("What's the area of a circle?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".katex").first()).toBeVisible();
    expect(katexRequests.length).toBeGreaterThan(0);
  });
});
