import { ArrowLeft, ExternalLink, Globe } from "lucide-react";
import { LogoMark } from "../components/Logo";
import { connectionsOrDefault, useCatalogStore } from "../lib/catalogSync";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Sites where Lofin is currently live. The list is edited from /admin → Connections. */
export function ConnectionsPage({ onExit }: { onExit: () => void }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const connections = connectionsOrDefault(catalog);

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
        <LogoMark size={28} />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white">Connections</h1>
          <p className="truncate text-xs text-slate-500">Where Lofin is currently operating</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {connections.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No connections listed yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {connections.map((c) => (
              <article
                key={c.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-base-600/60 bg-base-900/60 shadow-panel"
              >
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-base-800 to-base-900 text-accent-400/70">
                    <Globe size={56} />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="text-2xl font-semibold text-white">{c.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{hostOf(c.url)}</p>
                  {c.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{c.description}</p>}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center justify-center gap-2 self-start rounded-xl bg-accent-500 px-5 py-3 text-base font-semibold text-base-950 hover:bg-accent-400"
                  >
                    Open {c.name} <ExternalLink size={16} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
