import { expect, test } from "@playwright/test";
import { LOFIN_PRODUCT_KNOWLEDGE, buildSystemPrompt } from "../../../worker/src/adapters/base";

test("every Worker-backed chat receives the Lofin product reference", () => {
  const prompt = buildSystemPrompt();

  expect(prompt).toContain(LOFIN_PRODUCT_KNOWLEDGE);
  expect(prompt).toContain("Battle (two anonymous answers followed by a vote)");
  expect(prompt).toContain("Text to Speech (playable, downloadable audio)");
  expect(prompt).toContain("https://docs.lofin.dev");
  expect(prompt).toContain("does not own, train, or represent those models or their providers");
});
