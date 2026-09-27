import { lazy, Suspense, useEffect, useState } from "react";
import type { MathPlugins } from "./markdown/math";

const Renderer = lazy(() => import("./markdown/Renderer"));

let rendererPromise: Promise<unknown> | null = null;
/** Warm the renderer chunk (e.g. on idle after first paint) so the first reply renders styled. */
export function preloadMarkdown(): Promise<unknown> {
  return (rendererPromise ??= import("./markdown/Renderer"));
}

let mathCache: MathPlugins | null = null;
let mathPromise: Promise<MathPlugins> | null = null;
function loadMath(): Promise<MathPlugins> {
  return (mathPromise ??= import("./markdown/math").then((m) => (mathCache = m.mathPlugins)));
}

/** Unstyled stand-in shown for the instant the renderer chunk is still loading — the
 * text is readable immediately and in the same container, so nothing jumps. */
function PlainFallback({ content }: { content: string }) {
  return <div className="prose-lofin whitespace-pre-wrap break-words">{content}</div>;
}

/**
 * `math` turns on LaTeX rendering: `$x^2$` inline and `$$…$$` as a display block.
 * It's opt-in rather than always-on because chat replies routinely contain bare
 * dollar signs ("$5 vs $8"), which the math parser would otherwise swallow. The
 * Tutor page (pages/TutorPage.tsx) asks its models for LaTeX explicitly, so it's
 * the one place where the trade goes the other way.
 */
export function Markdown({ content, math = false }: { content: string; math?: boolean }) {
  const [mathPlugins, setMathPlugins] = useState<MathPlugins | null>(mathCache);
  useEffect(() => {
    if (!math || mathPlugins) return;
    let live = true;
    void loadMath().then((m) => live && setMathPlugins(m));
    return () => {
      live = false;
    };
  }, [math, mathPlugins]);

  if (math && !mathPlugins) return <PlainFallback content={content} />;
  return (
    <Suspense fallback={<PlainFallback content={content} />}>
      <Renderer content={content} math={math ? mathPlugins : null} />
    </Suspense>
  );
}
