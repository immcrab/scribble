import { ArrowLeft, ExternalLink, Globe } from "lucide-react";
import { LogoMark } from "../components/Logo";

interface Connection {
  name: string;
  host: string;
  url: string;
  description: string;
}

/** Sites where Lofin is currently live. Add a row here to list another one. */
const CONNECTIONS: Connection[] = [
  {
    name: "Lofin",
    host: "lofin.dev",
    url: "https://lofin.dev",
    description: "The main Lofin app.",
  },
  {
    name: "TextNexus",
    host: "textnexus.me",
    url: "https://textnexus.me",
    description: "Lofin running on TextNexus.",
  },
];

export function ConnectionsPage({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-base-950">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-700/60 bg-base-950/90 px-4 py-3 backdrop-blur">
        <button
          onClick={onExit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-base-700/60 hover:text-white"
          title="Back to Lofin"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700">
          <LogoMark size={15} className="text-base-950" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white">Connections</h1>
          <p className="truncate text-xs text-slate-500">Where Lofin is currently operating</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="space-y-2">
          {CONNECTIONS.map((c) => (
            <div
              key={c.host}
              className="flex items-center gap-3 rounded-xl border border-base-700/60 bg-base-900/40 px-4 py-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-800/70 text-accent-400">
                <Globe size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {c.host} · {c.description}
                </p>
              </div>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 hover:bg-accent-400"
              >
                Open <ExternalLink size={13} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
