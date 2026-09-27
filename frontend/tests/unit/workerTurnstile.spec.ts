import { test, expect } from "@playwright/test";
import {
  verifyTurnstileToken,
  turnstileQaSecret,
  isProductionHost,
  QA_DUMMY_TOKEN,
  QA_TEST_SECRETS,
} from "../../../worker/src/turnstile";

type Env = Parameters<typeof verifyTurnstileToken>[2];

const baseEnv = {
  TURNSTILE_SECRET: "real-secret",
  TURNSTILE_HOSTNAMES: "lofin.dev,www.lofin.dev,ai.lofin.dev",
} as unknown as Env;

/** Replaces global fetch for one call and records what secret the Worker sent to Siteverify. */
async function withSiteverify<T>(reply: Record<string, unknown>, fn: () => Promise<T>) {
  const calls: URLSearchParams[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: URLSearchParams }) => {
    calls.push(new URLSearchParams(init?.body));
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = real;
  }
}

const req = (url: string) => new Request(url, { method: "POST" });

test.describe("Worker Turnstile QA guard", () => {
  test("QA secret is never selected on production hosts, whatever the env says", () => {
    for (const mode of ["pass", "fail", "PASS"]) {
      for (const url of ["https://lofin.dev/api/turnstile/verify", "https://www.lofin.dev/x", "https://ai.lofin.dev/x", "https://api.lofin.dev/x"]) {
        expect(turnstileQaSecret({ TURNSTILE_QA_MODE: mode }, url)).toBeNull();
      }
    }
  });

  test("QA secret needs the env var AND a non-production host", () => {
    expect(turnstileQaSecret({}, "https://staging.lofin.dev/x")).toBeNull();
    expect(turnstileQaSecret({ TURNSTILE_QA_MODE: "true" }, "https://staging.lofin.dev/x")).toBeNull();
    expect(turnstileQaSecret({ TURNSTILE_QA_MODE: "pass" }, "https://staging.lofin.dev/x")).toBe(QA_TEST_SECRETS.pass);
    expect(turnstileQaSecret({ TURNSTILE_QA_MODE: "fail" }, "https://pr-1.staging.lofin.dev/x")).toBe(QA_TEST_SECRETS.fail);
    expect(isProductionHost("staging.lofin.dev")).toBe(false);
    expect(isProductionHost("lofin.dev")).toBe(true);
  });

  test("production: a dummy token goes to the real secret (and fails) even with QA mode set", async () => {
    const env = { ...baseEnv, TURNSTILE_QA_MODE: "pass" } as Env;
    const { result, calls } = await withSiteverify({ success: false }, () =>
      verifyTurnstileToken(QA_DUMMY_TOKEN, req("https://lofin.dev/api/turnstile/verify"), env)
    );
    expect(result).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].get("secret")).toBe("real-secret");
  });

  test("production: normal verification still checks action and hostname", async () => {
    const ok = await withSiteverify({ success: true, action: "site_gate", hostname: "lofin.dev" }, () =>
      verifyTurnstileToken("real-token", req("https://lofin.dev/api/turnstile/verify"), baseEnv)
    );
    expect(ok.result).toBe(true);
    const wrongHost = await withSiteverify({ success: true, action: "site_gate", hostname: "example.com" }, () =>
      verifyTurnstileToken("real-token", req("https://lofin.dev/api/turnstile/verify"), baseEnv)
    );
    expect(wrongHost.result).toBe(false);
  });

  test("staging QA: only the dummy token, only against the public test secret", async () => {
    const env = { ...baseEnv, TURNSTILE_QA_MODE: "pass" } as Env;
    const pass = await withSiteverify({ success: true }, () =>
      verifyTurnstileToken(QA_DUMMY_TOKEN, req("https://staging.lofin.dev/api/turnstile/verify"), env)
    );
    expect(pass.result).toBe(true);
    expect(pass.calls[0].get("secret")).toBe(QA_TEST_SECRETS.pass);

    const other = await withSiteverify({ success: true }, () =>
      verifyTurnstileToken("some-real-looking-token", req("https://staging.lofin.dev/api/turnstile/verify"), env)
    );
    expect(other.result).toBe(false);
    expect(other.calls).toHaveLength(0);
  });
});
