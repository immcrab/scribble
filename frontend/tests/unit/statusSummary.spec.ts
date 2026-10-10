import { expect, test } from "@playwright/test";
import { formatCount, lastDays, rankModels } from "../../src/lib/statusSummary";

test("rankModels orders by replies, shares ties, and drops unknown slugs", () => {
  const bySlug = new Map([
    ["a", "Model A"],
    ["b", "Model B"],
    ["c", "Model C"],
  ]);
  const ranked = rankModels(
    { a: { replies: 10, tokens: 500 }, b: { replies: 10, tokens: 900 }, c: 3, gone: { replies: 99 } },
    bySlug
  );

  expect(ranked.map((r) => r.slug)).toEqual(["b", "a", "c"]);
  expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  expect(ranked[2].relative).toBeCloseTo(0.3);
  expect(ranked.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
  expect(rankModels(null, bySlug)).toEqual([]);
});

test("lastDays pads missing days with zeros, oldest first", () => {
  const days = lastDays({ "2026-10-09": { replies: 4, tokens: 120, chats: 1 } }, 3, new Date("2026-10-09T15:00:00Z"));

  expect(days.map((d) => d.day)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  expect(days.map((d) => d.replies)).toEqual([0, 0, 4]);
});

test("formatCount abbreviates large numbers", () => {
  expect(formatCount(987)).toBe("987");
  expect(formatCount(12_345)).toBe("12.3k");
  expect(formatCount(4_560_000)).toBe("4.56M");
  expect(formatCount(2_000_000_000)).toBe("2.00B");
});
