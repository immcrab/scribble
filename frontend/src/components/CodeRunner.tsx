import { useRef, useState } from "react";
import { Play, TerminalSquare, X } from "lucide-react";

const STARTER = `// JavaScript runs locally in an isolated Web Worker.\nconst values = [1, 2, 3];\nconsole.log(values.map((n) => n * 2));`;

export function CodeRunner({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(STARTER);
  const [output, setOutput] = useState("");
  const worker = useRef<Worker | null>(null);
  const run = () => {
    worker.current?.terminate();
    const source = `self.onmessage = async () => { const logs = []; const show = (x) => typeof x === 'string' ? x : JSON.stringify(x); const console = { log: (...x) => logs.push(x.map(show).join(' ')), warn: (...x) => logs.push('Warning: ' + x.map(show).join(' ')), error: (...x) => logs.push('Error: ' + x.map(show).join(' ')) }; try { const result = await (async () => { ${code}\n })(); self.postMessage({ ok: true, output: [...logs, result === undefined ? '' : show(result)].filter(Boolean).join('\\n') || 'Completed with no output.' }); } catch (error) { self.postMessage({ ok: false, output: [...logs, String(error?.stack || error)].join('\\n') }); } };`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const next = new Worker(url);
    worker.current = next;
    setOutput("Running…");
    const timeout = window.setTimeout(() => { next.terminate(); setOutput("Stopped after 5 seconds to keep this local sandbox responsive."); URL.revokeObjectURL(url); }, 5000);
    next.onmessage = (event) => { window.clearTimeout(timeout); setOutput(event.data.output); next.terminate(); URL.revokeObjectURL(url); };
    next.onerror = (event) => { window.clearTimeout(timeout); setOutput(event.message); next.terminate(); URL.revokeObjectURL(url); };
    next.postMessage(null);
  };
  return <section className="mx-5 mb-3 rounded-xl border border-base-700/60 bg-base-900/50 p-3 sm:mx-8" aria-label="Local JavaScript runner"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-medium text-slate-300"><TerminalSquare size={14} className="text-accent-300" /> Local JavaScript sandbox</span><button onClick={onClose} className="text-slate-500 hover:text-slate-200" title="Close code runner"><X size={14} /></button></div><textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} rows={7} className="w-full resize-y rounded-lg border border-base-700/60 bg-base-950/70 p-2 font-mono text-xs text-slate-200 outline-none focus:border-accent-500/60" /><div className="mt-2 flex justify-between gap-2"><p className="text-[11px] text-slate-500">Runs only in your browser’s worker; it cannot access the page or its storage.</p><button onClick={run} className="flex shrink-0 items-center gap-1 rounded-lg bg-accent-500 px-2.5 py-1.5 text-xs font-semibold text-base-950 hover:bg-accent-400"><Play size={12} /> Run</button></div>{output && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-base-950/70 p-2 text-xs text-slate-400">{output}</pre>}</section>;
}
