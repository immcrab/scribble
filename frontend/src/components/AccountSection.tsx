import { useState } from "react";
import { LogIn, LogOut, Mail, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useAuthStore } from "../state/authStore";
import { clearAllLocalData } from "../lib/storage";

function SubLabel({ children }: { children: string }) {
  return <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

/** Settings → Account tab: signed-in identity, support contact, delete account, and a
 * local-only "wipe everything" escape hatch that doesn't require being signed in. */
export function AccountSection() {
  const { user, loading, signInWithGoogle, signOut, deleteAccount } = useAuthStore();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          <div className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-700 text-xs font-medium text-slate-200">
                {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{user.email ?? user.displayName}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-base-700/60 hover:text-white"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5 text-sm text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60"
          >
            <LogIn size={15} /> Sign in with Google
          </button>
        )}
      </div>

      <div>
        <SubLabel>Support</SubLabel>
        <a
          href="mailto:hi@scribbleai.dev"
          className="flex items-center gap-3 rounded-lg border border-base-600/60 bg-base-900/60 px-3 py-2.5 text-sm text-slate-200 hover:border-accent-500/50 hover:bg-base-700/60"
        >
          <Mail size={15} className="shrink-0 text-accent-400" />
          <span className="min-w-0 flex-1">
            <span className="block">Contact support</span>
            <span className="block text-xs text-slate-500">hi@scribbleai.dev — replies come from imcrabfr@gmail.com</span>
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
