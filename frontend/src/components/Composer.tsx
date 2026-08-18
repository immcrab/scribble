import { useRef, useState } from "react";
import { Paperclip, ArrowUp, Square, X, FileText, Code2 } from "lucide-react";
import type { Attachment } from "../types";
import { uid } from "../lib/id";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function Composer({
  onSend,
  onStop,
  generating,
  placeholder = "Ask anything...",
  autoFocus = false,
}: {
  onSend: (text: string, attachments: Attachment[], codeMode?: boolean) => void;
  onStop?: () => void;
  generating: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [codeMode, setCodeMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({ id: uid(), name: file.name, type: file.type, size: file.size, dataUrl });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || generating) return;
    onSend(trimmed, attachments, codeMode);
    setText("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  };

  return (
    <div className="rounded-2xl border border-base-600/60 bg-base-800/70 shadow-panel backdrop-blur-xl transition-colors focus-within:border-accent-500/60 focus-within:shadow-glow">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-base-700/60 px-4 pt-3">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 rounded-lg border border-base-600/60 bg-base-900/70 px-2 py-1 text-xs text-slate-300"
            >
              <FileText size={12} className="text-accent-400" />
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((x) => a.id !== x.id))}
                className="text-slate-500 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="max-h-[220px] w-full resize-none bg-transparent px-4 py-4 text-[15px] text-slate-100 placeholder-slate-500 outline-none"
      />

      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white"
            title="Add files"
          >
            <Paperclip size={15} />
            <span className="hidden sm:inline">Add files</span>
          </button>
          <button
            onClick={() => setCodeMode((c) => !c)}
            title="Code — force-open the preview panel (also opens automatically for coding requests)"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
              codeMode
                ? "border-accent-500/50 bg-accent-500/10 text-white"
                : "border-transparent text-slate-400 hover:bg-base-700/60 hover:text-white"
            }`}
          >
            <Code2 size={15} />
            <span className="hidden sm:inline">Code</span>
          </button>
        </div>

        {generating ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-base-950 transition-transform hover:scale-105 hover:bg-slate-300 active:scale-95"
            title="Stop generating"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-base-950 transition-all hover:scale-105 hover:bg-accent-400 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-base-600 disabled:text-slate-500"
            title="Send"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
