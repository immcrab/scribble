export interface ArtifactFile {
  name: string;
  language: string;
  content: string;
}

export interface Artifact {
  files: ArtifactFile[];
  /** Fully-formed HTML document ready to drop into an iframe, if this artifact is a web page. */
  previewHtml?: string;
  /** Message content with the extracted code fences removed, for rendering the surrounding prose. */
  remainingText: string;
}

const EXT_BY_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  py: "py",
  json: "json",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  yaml: "yml",
  yml: "yml",
  sql: "sql",
  markdown: "md",
  md: "md",
};

function extFor(lang: string): string {
  return EXT_BY_LANG[lang.toLowerCase()] ?? "txt";
}

const FENCE_RE = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;

export function extractArtifact(content: string): Artifact | null {
  const blocks: { lang: string; code: string }[] = [];
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content))) {
    const lang = (m[1] || "text").toLowerCase();
    const code = m[2].replace(/\n$/, "");
    if (code.trim().length === 0) continue;
    blocks.push({ lang, code });
  }
  if (blocks.length === 0) return null;

  const remainingText = content.replace(FENCE_RE, "").trim();

  const htmlBlock = blocks.find((b) => b.lang === "html" || b.lang === "htm");
  const cssBlocks = blocks.filter((b) => b.lang === "css");
  const jsBlocks = blocks.filter((b) => b.lang === "js" || b.lang === "javascript");

  const files: ArtifactFile[] = [];
  let previewHtml: string | undefined;

  if (htmlBlock) {
    files.push({ name: "index.html", language: "html", content: htmlBlock.code });
    cssBlocks.forEach((b, i) =>
      files.push({ name: cssBlocks.length > 1 ? `style${i + 1}.css` : "style.css", language: "css", content: b.code })
    );
    jsBlocks.forEach((b, i) =>
      files.push({ name: jsBlocks.length > 1 ? `script${i + 1}.js` : "script.js", language: "javascript", content: b.code })
    );

    let html = htmlBlock.code;
    const hasHtmlShell = /<html[\s>]/i.test(html);
    const styleTag = cssBlocks.length ? `<style>\n${cssBlocks.map((b) => b.code).join("\n\n")}\n</style>` : "";
    const scriptTag = jsBlocks.length ? `<script>\n${jsBlocks.map((b) => b.code).join("\n\n")}\n</script>` : "";

    if (hasHtmlShell) {
      if (styleTag) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styleTag}\n</head>`) : styleTag + html;
      if (scriptTag) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scriptTag}\n</body>`) : html + scriptTag;
      previewHtml = html;
    } else {
      previewHtml = `<!doctype html>\n<html>\n<head>${styleTag}</head>\n<body>\n${html}\n${scriptTag}\n</body>\n</html>`;
    }
  } else {
    const langCount: Record<string, number> = {};
    for (const b of blocks) langCount[b.lang] = (langCount[b.lang] ?? 0) + 1;
    const seen: Record<string, number> = {};
    for (const b of blocks) {
      seen[b.lang] = (seen[b.lang] ?? 0) + 1;
      const suffix = langCount[b.lang] > 1 ? String(seen[b.lang]) : "";
      files.push({ name: `file${suffix}.${extFor(b.lang)}`, language: b.lang, content: b.code });
    }
  }

  return { files, previewHtml, remainingText };
}

/** Heuristic: only worth a dedicated artifact panel for real files, not one-line inline snippets. */
export function isArtifactWorthy(artifact: Artifact): boolean {
  if (artifact.previewHtml) return true;
  if (artifact.files.length > 1) return true;
  const only = artifact.files[0];
  if (!only) return false;
  // Web languages already got a low bar via previewHtml above; for everything
  // else (Python, Go, SQL, ...) open the panel for anything past a one-liner
  // so short functions/scripts land in the workspace instead of the bubble.
  return only.content.split("\n").length >= 4;
}

/**
 * Lenient variant of extractArtifact for content that's still streaming in —
 * i.e. may end mid code-fence. Closed fences are parsed exactly like
 * extractArtifact; a single trailing *unterminated* fence (the block
 * currently being written) is treated as one more in-progress file so the
 * ArtifactWorkspace panel can render code live, token by token, instead of
 * only once the whole message has finished.
 */
export function extractPartialArtifact(content: string): Artifact | null {
  const closedFenceCount = (content.match(/```/g) ?? []).length;
  const hasOpenTrailingFence = closedFenceCount % 2 === 1;

  if (!hasOpenTrailingFence) {
    return extractArtifact(content);
  }

  const lastFenceStart = content.lastIndexOf("```");
  // Everything before the trailing open fence has a balanced (even) fence
  // count, so it parses cleanly as ordinary closed content.
  const closedPortion = content.slice(0, lastFenceStart);
  const trailing = content.slice(lastFenceStart);
  const trailingMatch = trailing.match(/```([a-zA-Z0-9]*)\n?([\s\S]*)$/);

  const base = extractArtifact(closedPortion);
  const files = base?.files.slice() ?? [];
  const remainingText = (base?.remainingText ?? closedPortion).trim();

  if (trailingMatch) {
    const lang = (trailingMatch[1] || "text").toLowerCase();
    const code = trailingMatch[2] ?? "";
    if (code.trim().length > 0 || files.length === 0) {
      files.push({ name: `file.${extFor(lang)}`, language: lang, content: code });
    }
  }

  if (files.length === 0) return null;
  return { files, previewHtml: undefined, remainingText };
}

/**
 * Heuristic: does this prompt ask the model to *produce* or *generate* code?
 *
 * When true the ArtifactWorkspace panel opens automatically the moment the
 * user hits send — no need to manually toggle the "Code" button first.
 *
 * The patterns are deliberately scoped so that common suggestion prompts
 * (landing-page copy, game ideas, storefront planning, "explain this
 * function") don't false-positive, while real coding requests like
 * "write a react app", "build me a python script", "create an api endpoint",
 * "write html + css", etc. do trigger.
 */
const CODING_PATTERNS: RegExp[] = [
  // Explicit coding terms that almost always relate to producing code
  /\b(code|coding|programming)\b/i,
  /\b(debug|debugger|refactor|refactoring)\b/i,
  /\b(script|algorithm)\b/i,
  /\b(api|endpoint|sdk)\b/i,
  /\b(deploy|deployment)\b/i,
  /\b(frontend|backend|fullstack)\b/i,

  // Programming languages & frameworks (standalone mentions)
  /\b(html|css|javascript|js|typescript|python|java|golang|rust|ruby|php|swift|kotlin|react|vue|angular|nodejs|express|django|flask|svelte|flutter|sql)\b/i,

  // Action verbs + code-related output nouns: "write/build/create a website"
  /\b(write|build|create|make|generate)\s+(a|an|the)?\s*(code|script|program|app|application|website|webpage|game|tool|function|class|method|api|bot|automation|component|module|feature)\b/i,

  // Personal requests: "i need a function", "give me a class"
  /\b(i need|i want|give me)\s+(a|an|the)\s+(function|class|method|script|code|program)\b/i,
];

export function isCodingRequest(text: string): boolean {
  return CODING_PATTERNS.some((re) => re.test(text));
}
