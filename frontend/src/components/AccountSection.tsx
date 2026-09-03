import { useState } from "react";
import { LogOut, Mail, Trash2, AlertTriangle, Loader2, Sparkles, MailCheck } from "lucide-react";
import { GoogleLogo } from "./icons/GoogleLogo";
import { useAuthStore } from "../state/authStore";
import { clearAllLocalData } from "../lib/storage";
import { isPuterSignedIn, puterSignOut } from "../lib/puterClient";

function SubLabel({ children }: { children: string }) {
  return <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

const inputClass =
  "w-full rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none";

/** Signed-out state: a Sign in / Create account tab switch over one email+password
 * form, plus Google sign-in. Creating an account triggers Firebase's verification
 * email (see authStore.signUpWithEmail). */
function SignInForms() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, error, notice, clearAuthFeedback } =
    useAuthStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (next: "signin" | "signup") => {
    if (next === mode) return;
    setMode(next);
    clearAuthFeedback();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "signup") await signUpWithEmail(email, password);
    else await signInWithEmail(email, password);
    setBusy(false);
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-base-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-base-600/60 bg-base-900/60 p-1">
        <button type="button" onClick={() => switchMode("signin")} className={tabClass(mode === "signin")}>
          Sign in
        </button>
        <button type="button" onClick={() => switchMode("signup")} className={tabClass(mode === "signup")}>
          Create account
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {mode === "signup"
          ? "New to Scribble — pick an email and password. We'll send a link to confirm your address."
          : "Welcome back. Sign in with the email and password you used before."}
      </p>

      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearAuthFeedback();
          }}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearAuthFeedback();
          }}
          className={inputClass}
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-500/90 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-500 disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {mode === "signin" && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => sendPasswordReset(email)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Forgot password?
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="h-px flex-1 bg-base-700/60" /> or <span className="h-px flex-1 bg-base-700/60" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5 text-sm text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60"
      >
        <GoogleLogo size={15} /> Continue with Google
      </button>
    </div>
  );
}

/** Shown to signed-in email/password users whose address isn't verified yet.
 * The store polls for verification in the background (authStore.watchEmailVerification),
 * so this clears itself once the link is clicked — no manual reload needed. */
function VerifyEmailBanner() {
  const { user, emailVerified, resendVerification, refreshUser, error, notice } = useAuthStore();
  const [busy, setBusy] = useState<"resend" | "check" | null>(null);
  if (!user || emailVerified) return null;
  const usesPassword = user.providerData.some((p) => p.providerId === "password");
  if (!usesPassword) return null;

  return (
    <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3">
      <p className="flex items-start gap-2 text-xs text-amber-300">
        <MailCheck size={13} className="mt-0.5 shrink-0" />
        <span>
          Confirm your email to finish setting up. We sent a link to <span className="font-medium">{user.email}</span> —
          open it and this updates on its own.
        </span>
      </p>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {notice && <p className="mt-1 text-xs text-emerald-400">{notice}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={async () => {
            setBusy("resend");
            await resendVerification();
            setBusy(null);
          }}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {busy === "resend" && <Loader2 size={12} className="animate-spin" />}
          Resend email
        </button>
        <button
          onClick={async () => {
            setBusy("check");
            await refreshUser();
            setBusy(null);
          }}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
        >
          {busy === "check" && <Loader2 size={12} className="animate-spin" />}
          I've confirmed it
        </button>
      </div>
    </div>
  );
}

/** Settings → Account tab: signed-in identity, support contact, delete account, and a
 * local-only "wipe everything" escape hatch that doesn't require being signed in. */
export function AccountSection() {
  const { user, emailVerified, loading, signOut, deleteAccount } = useAuthStore();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [puterSignedIn, setPuterSignedIn] = useState(isPuterSignedIn());

  const runDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      clearAllLocalData();
      window.location.reload();
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete account — try again.");
    }
  };

  const runClearLocal = () => {
    clearAllLocalData();
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <SubLabel>Signed in as</SubLabel>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Checking…
          </div>
        ) : user ? (
          <>
            <div className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-700 text-xs font-medium text-slate-200">
                  {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-slate-200">{user.email ?? user.displayName}</span>
                {emailVerified && user.providerData.some((p) => p.providerId === "password") && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <MailCheck size={11} /> Verified
                  </span>
                )}
              </span>
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-base-700/60 hover:text-white"
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
            <VerifyEmailBanner />
          </>
        ) : (
          <SignInForms />
        )}
      </div>

      <div>
        <SubLabel>Puter.js</SubLabel>
        <div className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5">
          <Sparkles size={15} className="shrink-0 text-accent-400" />
          <span className="min-w-0 flex-1 text-sm text-slate-200">
            {puterSignedIn ? "Signed in to Puter.js" : "Not signed in"}
          </span>
          {puterSignedIn && (
            <button
              onClick={() => {
                puterSignOut();
                setPuterSignedIn(false);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-base-700/60 hover:text-white"
            >
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Used for Puter.js models (Claude, GPT via Puter) — separate account and billing from Scribble.
        </p>
      </div>

      <div>
        <SubLabel>Support</SubLabel>
        <a
          href="mailto:support@scribbleai.dev"
          className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5 text-sm text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60"
        >
          <Mail size={15} className="shrink-0 text-accent-400" />
          <span className="min-w-0 flex-1">
            <span className="block">Contact support</span>
            <span className="block text-xs text-slate-500">support@scribbleai.dev</span>
          </span>
        </a>
      </div>

      <div>
        <SubLabel>Danger zone</SubLabel>
        <div className="space-y-2">
          {user && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.04] p-3">
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex w-full items-center gap-2.5 text-left text-sm text-red-400 hover:text-red-300"
                >
                  <Trash2 size={15} className="shrink-0" />
                  <span>
                    <span className="block font-medium">Delete account</span>
                    <span className="block text-xs text-red-400/70">Removes your synced chats and signs you out everywhere.</span>
                  </span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="flex items-start gap-2 text-xs text-red-300">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    This permanently deletes your account and synced chats. You'll be asked to sign in again to confirm.
                  </p>
                  {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="flex-1 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-base-700/60 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={runDeleteAccount}
                      disabled={deleting}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {deleting && <Loader2 size={12} className="animate-spin" />}
                      Yes, delete it
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-base-600/60 bg-base-900/60 p-3">
            {!confirmingClear ? (
              <button
                onClick={() => setConfirmingClear(true)}
                className="flex w-full items-center gap-2.5 text-left text-sm text-slate-300 hover:text-white"
              >
                <Trash2 size={15} className="shrink-0 text-slate-500" />
                <span>
                  <span className="block font-medium">Clear local data</span>
                  <span className="block text-xs text-slate-500">Wipes chats and settings stored in this browser only.</span>
                </span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400">This clears everything stored in this browser. Synced cloud data (if signed in) is untouched.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingClear(false)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-base-700/60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runClearLocal}
                    className="flex-1 rounded-lg bg-base-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-base-600"
                  >
                    Yes, clear it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
