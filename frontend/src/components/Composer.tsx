import { useRef, useState } from "react";
import { Paperclip, ArrowUp, Square, X, FileText, Code2, Image as ImageIcon, AlertTriangle } from "lucide-react";
import type { Attachment, ModelDef } from "../types";
import { uid } from "../lib/id";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export function Composer({
  onSend,
  onStop,
  generating,
  placeholder = "Ask anything...",
  autoFocus = false,
  model,
  sendOnEnter = true,
}: {
  onSend: (text: string, attachments: Attachment[], codeMode?: boolean) => void;
  onStop?: () => void;
  generating: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Active model (or, in Battle mode, undefined since models aren't picked pre-send) — gates the vision warning below. */
  model?: ModelDef;
  /** When false, Enter inserts a newline and Ctrl/Cmd+Enter sends instead. */
  sendOnEnter?: boolean;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [codeMode, setCodeMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const next: Attachment[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) continue;
      const isImage = file.type.startsWith("image/");
      let dataUrl: string;
      let storedSize = file.size;
      let storedType = file.type || "application/octet-stream";

      if (isImage) {
        // Keep base64 requests small enough for the Worker/provider while
        // preserving enough detail for vision and OCR.
        const prepared = await prepareImage(file);
        dataUrl = prepared.dataUrl;
        storedSize = prepared.size;
        storedType = prepared.type;
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      next.push({
        id: uid(),
        name: file.name || "Pasted image",
        type: storedType,
        size: storedSize,
        dataUrl,
      });
    }
    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  };

  const prepareImage = (file: File): Promise<{ dataUrl: string; type: string; size: number }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const maxDimension = 2048;
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
          const type = file.type === "image/png" ? "image/png" : "image/jpeg";
          const dataUrl = canvas.toDataURL(type, type === "image/jpeg" ? 0.86 : undefined);
          resolve({ dataUrl, type, size: Math.ceil((dataUrl.length * 3) / 4) });
        };
        image.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || generating) return;
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

  const canSubmit = (text.trim().length > 0 || attachments.length > 0) && !generating;

  const hasImageAttachment = attachments.some((a) => a.type?.startsWith("image/") || a.dataUrl?.startsWith("data:image/"));
  const showVisionWarning = hasImageAttachment && model && !model.supportsVision;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-2xl border bg-base-800/70 shadow-panel backdrop-blur-xl transition-all focus-within:border-accent-500/60 focus-within:shadow-glow ${
        isDragging ? "border-accent-500 bg-accent-500/10" : "border-base-600/60"
      }`}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2.5 border-b border-base-700/60 px-4 py-3">
          {attachments.map((a) => {
            const isImage = a.type?.startsWith("image/") || a.dataUrl?.startsWith("data:image/");
            return (
              <div
                key={a.id}
                className="group relative flex items-center gap-2 rounded-xl border border-base-600/70 bg-base-900/80 p-1.5 text-xs text-slate-300 shadow-sm transition-all hover:border-base-500"
              >
                {isImage ? (
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-base-950">
                    <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-base-800 text-accent-400">
                    <FileText size={16} />
                  </div>
                )}
                <div className="min-w-0 max-w-[130px] pr-5">
                  <span className="block truncate font-medium text-slate-200">{a.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {a.size ? `${(a.size / 1024).toFixed(0)} KB` : isImage ? "Image" : "File"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => a.id !== x.id))}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-base-800/90 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showVisionWarning && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">{model!.displayName}</strong> can't see images — switch to a vision model
            (look for the <span className="whitespace-nowrap">"Vision"</span> badge) to have it look at what you attached.
          </span>
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-base-950/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-accent-400">
            <ImageIcon size={20} className="animate-bounce" />
            Drop images or files here to attach
          </div>
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
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          const wantsSend = sendOnEnter ? !(e.metaKey || e.ctrlKey) : e.metaKey || e.ctrlKey;
          if (!wantsSend) return;
          e.preventDefault();
          submit();
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
            accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.csv"
            className="hidden"
            onChange={handleFileInput}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-base-700/60 hover:text-white"
            title="Add images or files"
          >
            <Paperclip size={15} />
            <span className="hidden sm:inline">Add files</span>
          </button>
          <button
            type="button"
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
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-base-950 transition-transform hover:scale-105 hover:bg-slate-300 active:scale-95"
            title="Stop generating"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
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
