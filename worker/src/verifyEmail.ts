/**
 * /api/auth/send-verification — generates a Firebase email-verification link
 * with the Admin-equivalent REST call (see firebase.ts) and sends a
 * custom-branded email via Resend.
 *
 * Auth: the caller passes the freshly-created user's Firebase ID token in the
 * body. The Worker verifies it (see firebaseVerifyToken.ts) and takes the email
 * *from the token* — so a caller can only ever request verification mail for
 * their own address, and no shared secret has to live in the static frontend.
 * A per-IP limiter and a per-email hourly cooldown still apply.
 */
import type { Env } from "./types";
import { isRateLimited, isEmailRateLimited } from "./ratelimit";
import { generateEmailVerificationLink, parseServiceAccount } from "./firebase";
import { verifyFirebaseIdToken } from "./firebaseVerifyToken";

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

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
  if (!env.FIREBASE_SERVICE_ACCOUNT || !env.RESEND_API_KEY) {
    return json({ error: "Verification email is not configured on this Worker." }, 500, cors);
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

  const idToken = (body as { idToken?: unknown }).idToken;
  if (typeof idToken !== "string" || !idToken) {
    return json({ error: "Request must include a Firebase idToken." }, 400, cors);
  }

  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);

  let email: string;
  try {
    const claims = await verifyFirebaseIdToken(idToken, sa.project_id);
    if (claims.emailVerified) {
      return json({ ok: true, alreadyVerified: true }, 200, cors);
    }
    if (!claims.email) {
      return json({ error: "This account has no email address to verify." }, 400, cors);
    }
    email = claims.email.toLowerCase();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid ID token.";
    return json({ error: message }, 401, cors);
  }

  // Per-address cooldown — 3 per hour. The token already proves ownership, so
  // this is just to stop a user hammering "resend".
  if (isEmailRateLimited(email)) {
    return json({ error: "A verification email was sent recently. Check your inbox or try again later." }, 429, cors);
  }

  try {
    const link = await generateEmailVerificationLink(sa, email, {
      continueUrl: env.VERIFY_CONTINUE_URL,
    });
    await sendViaResend(env, email, link);
    return json({ ok: true }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send verification email.";
    return json({ error: message }, 502, cors);
  }
}
