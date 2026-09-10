/**
 * /api/auth/send-verification — generates a Firebase email-verification link
 * with the Admin-equivalent REST call (see firebase.ts) and sends a
 * custom-branded email via Resend.
 *
 * Guarded by the X-Verify-Secret shared secret (VERIFY_ENDPOINT_SECRET) plus
 * the existing per-IP limiter and a per-email cooldown, so it can't be used to
 * mailbomb an address.
 */
import type { Env } from "./types";
import { timingSafeEqual } from "./auth";
import { isRateLimited, isEmailRateLimited } from "./ratelimit";
import { generateEmailVerificationLink, parseServiceAccount } from "./firebase";

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// Deliberately conservative — a valid address, not full RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function verificationEmailHtml(link: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;max-width:480px;">
            <tr>
              <td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:16px;">
                Scribble
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#3f3f46;padding-bottom:24px;">
                Confirm your email address to finish setting up your Scribble account.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${link}"
                   style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
                  Verify email
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#71717a;padding-bottom:8px;">
                Or paste this link into your browser:
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#2563eb;word-break:break-all;padding-bottom:24px;">
                ${link}
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;line-height:1.6;color:#a1a1aa;border-top:1px solid #e4e4e7;padding-top:16px;">
                If you didn't create a Scribble account, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendViaResend(env: Env, to: string, link: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.VERIFY_EMAIL_FROM || "Scribble <scribble@owenis.me>",
      to: [to],
      subject: "Verify your email for Scribble",
      html: verificationEmailHtml(link),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    throw new Error(`Resend send failed: ${err.message || err.name || res.status}`);
  }
}

export async function handleSendVerification(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  if (!env.VERIFY_ENDPOINT_SECRET || !env.FIREBASE_SERVICE_ACCOUNT || !env.RESEND_API_KEY) {
    return json({ error: "Verification email is not configured on this Worker." }, 500, cors);
  }

  const supplied = request.headers.get("X-Verify-Secret");
  if (supplied === null || !timingSafeEqual(supplied, env.VERIFY_ENDPOINT_SECRET)) {
    return json({ error: "Invalid or missing verification secret." }, 401, cors);
  }

  const ipKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (isRateLimited(ipKey)) {
    return json({ error: "Rate limit exceeded. Try again shortly." }, 429, cors);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed JSON body." }, 400, cors);
  }

  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return json({ error: "Request must include a valid email." }, 400, cors);
  }
  const normalized = email.trim().toLowerCase();

  // Per-address cooldown — the real mailbomb guard (3 per hour).
  if (isEmailRateLimited(normalized)) {
    return json({ error: "A verification email was sent recently. Check your inbox or try again later." }, 429, cors);
  }

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const link = await generateEmailVerificationLink(sa, normalized, {
      continueUrl: env.VERIFY_CONTINUE_URL,
    });
    await sendViaResend(env, normalized, link);
    return json({ ok: true }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send verification email.";
    // Don't leak whether the address exists in Firebase Auth to an attacker who
    // somehow has the secret — collapse the not-found case into a generic 200.
    // Identity Toolkit uses USER_NOT_FOUND here; EMAIL_NOT_FOUND is the
    // password-reset variant — match both.
    if (/USER_NOT_FOUND|EMAIL_NOT_FOUND/i.test(message)) {
      return json({ ok: true }, 200, cors);
    }
    return json({ error: message }, 502, cors);
  }
}
