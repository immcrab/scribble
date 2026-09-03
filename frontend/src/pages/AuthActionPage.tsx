import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Eye, EyeOff, MailCheck } from "lucide-react";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { LogoMark } from "../components/Logo";

/**
 * Landing page for Firebase's account-management email links (verify address,
 * reset password, recover email). By default those links point at Firebase's own
 * bare handler page; setting a custom action URL of "<origin>/auth/action" in the
 * Firebase console (Authentication → Templates → the pencil on each template →
 * "Customize action URL") routes them here instead, so the user gets a branded
 * "You've been verified" screen in the app rather than a stock Google one.
 *
 * Firebase appends `?mode=<action>&oobCode=<code>&continueUrl=<url>` to the URL.
 * All three of Firebase's action modes are handled so the single custom URL is
 * safe for every template.
 */

const params = new URLSearchParams(window.location.search);
const MODE = params.get("mode");
const OOB = params.get("oobCode") ?? "";
const CONTINUE_URL = params.get("continueUrl");

/*
 * `continueUrl` reaches this page through the query string, so it's
 * attacker-controllable even though Firebase validated it when the email went
 * out — anyone can hand around a link to this page with a continueUrl of their
 * choosing. Rendering it unchecked would make the page an open redirect on a
 * domain the user was just told to trust, so only our own hosts are honoured;
 * anything else falls back to the app root.
 */
const ALLOWED_CONTINUE_HOSTS = new Set([
  "scribbleai.dev",
  "www.scribbleai.dev",
  "owenis.me",
  "www.owenis.me",
  "immcrab.github.io",
  "localhost",
]);

function appHref(): string {
  const fallback = import.meta.env.BASE_URL || "/";
  if (!CONTINUE_URL) return fallback;
  try {
    const url = new URL(CONTINUE_URL, window.location.origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return fallback;
    return ALLOWED_CONTINUE_HOSTS.has(url.hostname) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

type Phase =
  | { k: "working" }
  | { k: "done"; icon: "verified" | "ok"; title: string; body: string }
  | { k: "error"; title: string; body: string }
  | { k: "reset-form"; email: string }
  | { k: "reset-done" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-base-950 p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-glow">
          <LogoMark size={20} className="text-base-950" />
        </div>
        {children}
      </div>
    </div>
  );
}

function ContinueButton({ label = "Continue to Scribble" }: { label?: string }) {
  return (
    <a
      href={appHref()}
      className="mt-7 inline-flex items-center justify-center rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
    >
      {label}
    </a>
  );
}

export function AuthActionPage() {
  const [phase, setPhase] = useState<Phase>({ k: "working" });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fail = (title: string, body: string) => {
      if (!cancelled) setPhase({ k: "error", title, body });
    };

    async function run() {
      if (!MODE || !OOB) {
        fail("Broken link", "This link is missing information. Request a new email from Scribble and open the newest one.");
        return;
      }
      try {
        if (MODE === "verifyEmail" || MODE === "verifyAndChangeEmail") {
          await applyActionCode(auth, OOB);
          // If this is the same browser they signed up in, refresh the local
          // session so the app already knows they're verified when they land.
          try {
            await auth.currentUser?.reload();
          } catch {
            /* not signed in on this device — the link still worked */
          }
          if (cancelled) return;
          setPhase({
            k: "done",
            icon: "verified",
            title: "You've been verified",
            body: "Your email address is confirmed. Head back to Scribble — if it's open in another tab, it'll update on its own.",
          });
        } else if (MODE === "recoverEmail") {
          const info = await checkActionCode(auth, OOB);
          await applyActionCode(auth, OOB);
          if (cancelled) return;
          setPhase({
            k: "done",
            icon: "ok",
            title: "Email restored",
            body: `Your account email was changed back to ${
              info.data.email ?? "its previous address"
            }. If you didn't expect this, reset your password now.`,
          });
        } else if (MODE === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, OOB);
          if (cancelled) return;
          setPhase({ k: "reset-form", email });
        } else {
          fail("Unsupported link", "Scribble doesn't handle this kind of link.");
        }
      } catch {
        fail(
          "This link has expired",
          "It may have already been used, or it simply timed out. Request a fresh email from Scribble and open the newest one.",
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (pw.length < 6) {
      setFormErr("Use at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setFormErr("Those don't match.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, OOB, pw);
      setPhase({ k: "reset-done" });
    } catch {
      setFormErr("Couldn't set the password — the link may have expired. Request a new one from Scribble.");
    } finally {
      setBusy(false);
    }
  };

  if (phase.k === "working") {
    return (
      <Shell>
        <Loader2 size={22} className="mx-auto mb-4 animate-spin text-slate-500" />
        <p className="text-sm text-slate-400">Checking your link…</p>
      </Shell>
    );
  }

  if (phase.k === "error") {
    return (
      <Shell>
        <XCircle size={26} className="mx-auto mb-4 text-red-400" />
        <h1 className="mb-3 font-serif text-2xl font-light text-white">{phase.title}</h1>
        <p className="text-sm leading-relaxed text-slate-400">{phase.body}</p>
        <ContinueButton label="Back to Scribble" />
      </Shell>
    );
  }

  if (phase.k === "done") {
    return (
      <Shell>
        {phase.icon === "verified" ? (
          <MailCheck size={26} className="mx-auto mb-4 text-emerald-400" />
        ) : (
          <CheckCircle2 size={26} className="mx-auto mb-4 text-emerald-400" />
        )}
        <h1 className="mb-3 font-serif text-2xl font-light text-white">{phase.title}</h1>
        <p className="text-sm leading-relaxed text-slate-400">{phase.body}</p>
        <ContinueButton />
      </Shell>
    );
  }

  if (phase.k === "reset-done") {
    return (
      <Shell>
        <CheckCircle2 size={26} className="mx-auto mb-4 text-emerald-400" />
        <h1 className="mb-3 font-serif text-2xl font-light text-white">Password changed</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          You can now sign in to Scribble with your new password.
        </p>
        <ContinueButton label="Go to Scribble" />
      </Shell>
    );
  }

  // reset-form
  const inputClass =
    "w-full rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none";

  return (
    <Shell>
      <h1 className="mb-2 font-serif text-2xl font-light text-white">Choose a new password</h1>
      <p className="mb-5 text-sm text-slate-400">for {phase.email}</p>
      <form onSubmit={submitReset} className="space-y-2 text-left">
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            placeholder="New password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setFormErr(null);
            }}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <input
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={pw2}
          onChange={(e) => {
            setPw2(e.target.value);
            setFormErr(null);
          }}
          className={inputClass}
        />
        {formErr && <p className="text-xs text-red-400">{formErr}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-500/90 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-500 disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Set new password
        </button>
      </form>
    </Shell>
  );
}
