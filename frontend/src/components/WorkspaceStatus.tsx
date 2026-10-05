import { useEffect, useState } from "react";
import { Check, Cloud, Undo2 } from "lucide-react";
import { useChatStore } from "../state/chatStore";
import { useAuthStore } from "../state/authStore";

export function WorkspaceStatus() {
  const user = useAuthStore((s) => s.user);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => { const refresh = () => setOnline(navigator.onLine); window.addEventListener("online", refresh); window.addEventListener("offline", refresh); return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); }; }, []);
  return <span className={`ml-auto hidden items-center gap-1 text-[11px] sm:flex ${online ? "text-slate-500" : "text-amber-400"}`} title={online ? (user ? "Saved locally and queued for cloud sync" : "Saved locally in this browser") : "Offline — saved locally until you reconnect"}>{online ? <Cloud size={12} /> : <Cloud size={12} />}{online ? (user ? "Synced" : "Saved locally") : "Offline"}</span>;
}

export function DeleteUndoToast() {
  const deleted = useChatStore((s) => s.lastDeletedChat);
  const undo = useChatStore((s) => s.undoDeleteChat);
  const clear = useChatStore((s) => s.dismissDeletedChat);
  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(clear, 8000);
    return () => window.clearTimeout(timer);
  }, [deleted, clear]);
  if (!deleted) return null;
  return <div className="fixed bottom-5 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-base-600/70 bg-base-900 px-3 py-2 text-sm text-slate-200 shadow-panel"><Check size={15} className="text-accent-300" /><span className="max-w-[15rem] truncate">Deleted “{deleted.title}”</span><button onClick={undo} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent-300 hover:bg-base-800"><Undo2 size={13} /> Undo</button></div>;
}
