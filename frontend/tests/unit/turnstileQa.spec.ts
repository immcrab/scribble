import { test, expect } from "@playwright/test";
import {
  resolveTurnstileConfig,
  isProductionHost,
  isStagingHost,
  PRODUCTION_SITE_KEY,
  QA_SITE_KEYS,
} from "../../src/lib/turnstileQa";

const PROD_HOSTS = ["lofin.dev", "www.lofin.dev", "ai.lofin.dev", "LOFIN.DEV", "lofin.dev.", "api.lofin.dev", "anything.lofin.dev"];

test.describe("resolveTurnstileConfig (frontend)", () => {
  for (const hostname of PROD_HOSTS) {
    test(`never enables QA on production host ${hostname}`, () => {
      for (const search of ["?turnstile_qa=pass", "?turnstile_qa=interactive", "?turnstile_qa=block", ""]) {
        for (const storedMode of [null, "pass", "block"]) {
          const cfg = resolveTurnstileConfig({ hostname, search, storedMode, extraStagingHosts: [hostname, "lofin.dev"] });
          expect(cfg.qaMode).toBeNull();
          expect(cfg.siteKey).toBe(PRODUCTION_SITE_KEY);
          expect(cfg.persist).toBeNull();
        }
      }
    });
  }

  test("production hosts can't be re-classified as staging, even via the extra-hosts list", () => {
    for (const h of PROD_HOSTS) expect(isStagingHost(h, [h])).toBe(false);
    for (const h of PROD_HOSTS) expect(isProductionHost(h)).toBe(true);
  });

  test("unlisted hosts stay on the production key", () => {
    for (const hostname of ["example.com", "app.lofin.test", "lofin.dev.evil.com", "staging.lofin.dev.evil.com"]) {
      const cfg = resolveTurnstileConfig({ hostname, search: "?turnstile_qa=pass" });
      expect(cfg.siteKey).toBe(PRODUCTION_SITE_KEY);
      expect(cfg.qaMode).toBeNull();
    }
  });

  test("staging hosts honour each QA mode from the URL and persist it", () => {
    for (const hostname of ["staging.lofin.dev", "pr-42.staging.lofin.dev", "localhost", "127.0.0.1"]) {
      for (const mode of ["pass", "block", "interactive"] as const) {
        const cfg = resolveTurnstileConfig({ hostname, search: `?turnstile_qa=${mode}` });
        expect(cfg).toEqual({ siteKey: QA_SITE_KEYS[mode], qaMode: mode, persist: mode });
      }
    }
  });

  test("staging: stored mode applies without a URL param; ?turnstile_qa=off clears it; junk is ignored", () => {
    expect(resolveTurnstileConfig({ hostname: "staging.lofin.dev", search: "", storedMode: "block" })).toMatchObject({ qaMode: "block", persist: null });
    expect(resolveTurnstileConfig({ hostname: "staging.lofin.dev", search: "?turnstile_qa=off", storedMode: "pass" })).toMatchObject({
      qaMode: null,
      siteKey: PRODUCTION_SITE_KEY,
      persist: "off",
    });
    expect(resolveTurnstileConfig({ hostname: "staging.lofin.dev", search: "?turnstile_qa=yes-please" }).qaMode).toBeNull();
    expect(resolveTurnstileConfig({ hostname: "staging.lofin.dev", search: "", storedMode: "garbage" }).qaMode).toBeNull();
  });

  test("extra staging hosts (VITE_TURNSTILE_QA_HOSTS) are opt-in", () => {
    expect(resolveTurnstileConfig({ hostname: "qa.example.com", search: "?turnstile_qa=pass" }).qaMode).toBeNull();
    expect(resolveTurnstileConfig({ hostname: "qa.example.com", search: "?turnstile_qa=pass", extraStagingHosts: ["qa.example.com"] }).qaMode).toBe("pass");
  });
});
