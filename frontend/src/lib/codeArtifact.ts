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

// A line that's *just* a filename, optionally dressed up the way models tend to write one:
// "File: app.py", "**index.html**", "`style.css`", "### main.go", a heading, "utils.js" bare, or
// "**index.html** — the homepage" with a trailing dash/colon description. Anchored so it can't
// grab a mid-sentence word that happens to contain a dot — the line (after any decoration, and
// before any trailing " — note") has to be the filename.
const FILENAME_LINE_CORE =
  "[ \\t]*(?:#{1,6}[ \\t]*)?(?:\\*\\*|__)?`?(?:(?:File|Filename|Path)[ \\t]*:[ \\t]*)?([A-Za-z0-9_][\\w./-]*\\.[A-Za-z0-9]{1,10})`?(?:\\*\\*|__)?[ \\t]*(?:[:\u2014\u2013-][ \\t]*[^\\n]*)?";

// Between the filename line and the opening fence, models very often leave a blank line (or a
// few) — tolerate any run of whitespace-only lines there so "**index.html**\n\n```html" still
// links the name to its block.
const GAP = "\\n(?:[ \\t]*\\n)*";

// The opening fence: an info string that's more than the bare language ("```html title=index.html",
// "```js app.js") is captured too, so a filename tucked in there gets picked up instead of a
// generic name — and, importantly, the fence still matches at all (a stray info string used to
// make the whole block invisible to the parser, dropping that file).
const FENCE_OPEN = "```([a-zA-Z0-9+#.-]*)([^\\n]*)\\n";

// The optional leading group picks up a filename line written above the fence (see worker
// SYSTEM_PROMPT), in whichever of the common styles above the model used, so a model that names
// its files gets real filenames instead of generic file1.js/file2.js ones.
const FENCE_RE = new RegExp("(?:(?:^|\\n)" + FILENAME_LINE_CORE + GAP + ")?" + FENCE_OPEN + "([\\s\\S]*?)```", "gim");

// Same filename-line shape, but anchored to the *end* of a string instead of followed by a
// fence — used to catch the hint above a still-open trailing fence while a message is streaming.
const TRAILING_FILENAME_LINE_RE = new RegExp("(?:^|\\n)" + FILENAME_LINE_CORE + GAP + "$", "i");

/** Pull a filename out of a fence info string ("```html index.html", "```js title=app.js").
 * The extension must start with a letter so a stray "v2.0" in a comment-y info string
 * doesn't get mistaken for a filename. */
function filenameFromInfoString(info: string): string | undefined {
  const m = info.match(/([A-Za-z0-9_][\w./-]*\.[A-Za-z][A-Za-z0-9]{0,9})(?:\b|$)/);
  return m ? m[1] : undefined;
}

/**
 * A fenced block that's actually an ASCII directory tree / file listing — the kind a model
 * prints to outline a project ("apex-motors/\n├── index.html\n└── styles.css") — rather than
 * a real file. Skipped so it doesn't surface as a bogus "file.txt" in the workspace.
 */
function looksLikeFileTree(code: string): boolean {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const treeish = lines.filter((l) => /[│├└]|^[\w.-]+\/$/.test(l)).length;
  return treeish >= Math.ceil(lines.length * 0.6);
}

// A model that doesn't put the filename on its own line very often still opens the file with a
// same-language comment naming it — e.g. `// src/app.js`, `# app.py`, `<!-- index.html -->`.
// Checked as a fallback, after the line-above-fence convention, before giving up to a generic name.
const LEADING_COMMENT_RE = /^[ \t]*(?:\/\/|#|--|;)[ \t]*([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,10})[ \t]*$|^[ \t]*<!--[ \t]*([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,10})[ \t]*-->[ \t]*$/m;

function filenameFromLeadingComment(code: string): string | undefined {
  const firstLine = code.split("\n", 1)[0] ?? "";
  const m = firstLine.match(LEADING_COMMENT_RE);
  return m ? (m[1] ?? m[2]) : undefined;
}

function cleanFilename(raw: string): string {
  return raw.trim().replace(/^[`*_]+|[`*_]+$/g, "").trim();
}

/** Appends " (2)", " (3)", ... before the extension to disambiguate a name collision. */
function dedupeName(name: string, seen: Set<string>): string {
  if (!seen.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (seen.has(candidate)) {
    i++;
    candidate = `${base} (${i})${ext}`;
  }
  return candidate;
}

function buildPreviewHtml(files: ArtifactFile[]): string | undefined {
  const htmlFile =
    files.find((f) => f.name.toLowerCase() === "index.html") ??
    files.find((f) => f.language === "html" || f.language === "htm" || /\.html?$/i.test(f.name));
  if (!htmlFile) return undefined;

  const cssFiles = files.filter((f) => f !== htmlFile && (f.language === "css" || /\.css$/i.test(f.name)));
  const jsFiles = files.filter(
    (f) => f !== htmlFile && (f.language === "js" || f.language === "javascript" || /\.js$/i.test(f.name))
  );

  let html = htmlFile.content;
  const hasHtmlShell = /<html[\s>]/i.test(html);
  const styleTag = cssFiles.length ? `<style>\n${cssFiles.map((f) => f.content).join("\n\n")}\n</style>` : "";
  const scriptTag = jsFiles.length ? `<script>\n${jsFiles.map((f) => f.content).join("\n\n")}\n</script>` : "";

  if (hasHtmlShell) {
    if (styleTag) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${styleTag}\n</head>`) : styleTag + html;
    if (scriptTag) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scriptTag}\n</body>`) : html + scriptTag;
    return html;
  }
  return `<!doctype html>\n<html>\n<head>${styleTag}</head>\n<body>\n${html}\n${scriptTag}\n</body>\n</html>`;
}

export function extractArtifact(content: string): Artifact | null {
  const blocks: { lang: string; code: string; filename?: string }[] = [];
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content))) {
    const lang = (m[2] || "text").toLowerCase();
    const code = m[4].replace(/\n$/, "");
    if (code.trim().length === 0) continue;
    const filename =
      (m[1] && cleanFilename(m[1])) || filenameFromInfoString(m[3] ?? "") || filenameFromLeadingComment(code);
    if (!filename && looksLikeFileTree(code)) continue;
    blocks.push({ lang, code, filename });
  }
  if (blocks.length === 0) return null;

  const remainingText = content.replace(FENCE_RE, "").trim();

  const langCount: Record<string, number> = {};
  for (const b of blocks) if (!b.filename) langCount[b.lang] = (langCount[b.lang] ?? 0) + 1;
  const seenLang: Record<string, number> = {};
  const seenNames = new Set<string>();

  const files: ArtifactFile[] = blocks.map((b) => {
    let name: string;
    if (b.filename) {
      name = b.filename;
    } else {
      seenLang[b.lang] = (seenLang[b.lang] ?? 0) + 1;
      const suffix = langCount[b.lang] > 1 ? String(seenLang[b.lang]) : "";
      name = `file${suffix}.${extFor(b.lang)}`;
    }
    name = dedupeName(name, seenNames);
    seenNames.add(name);
    return { name, language: b.lang, content: b.code };
  });

  return { files, previewHtml: buildPreviewHtml(files), remainingText };
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
  let closedPortion = content.slice(0, lastFenceStart);
  const trailing = content.slice(lastFenceStart);
  const trailingMatch = trailing.match(/```([a-zA-Z0-9+#.-]*)([^\n]*)\n?([\s\S]*)$/);

  // Pull an optional filename-line hint immediately above the open fence — same convention
  // extractArtifact recognizes for closed fences — so the in-progress file gets a real name
  // while it's still streaming instead of a generic one that would flash and get replaced.
  const fileLineMatch = closedPortion.match(TRAILING_FILENAME_LINE_RE);
  let filenameHint: string | undefined;
  if (fileLineMatch) {
    filenameHint = cleanFilename(fileLineMatch[1]);
    closedPortion = closedPortion.slice(0, fileLineMatch.index);
  }

  const base = extractArtifact(closedPortion);
  const files = base?.files.slice() ?? [];
  const remainingText = (base?.remainingText ?? closedPortion).trim();
  const seenNames = new Set(files.map((f) => f.name));

  if (trailingMatch) {
    const lang = (trailingMatch[1] || "text").toLowerCase();
    const code = trailingMatch[3] ?? "";
    if (code.trim().length > 0 || files.length === 0) {
      const name = dedupeName(
        filenameHint ?? filenameFromInfoString(trailingMatch[2] ?? "") ?? filenameFromLeadingComment(code) ?? `file.${extFor(lang)}`,
        seenNames
      );
      files.push({ name, language: lang, content: code });
    }
  }

  if (files.length === 0) return null;
  // Build a preview even from a still-open (or truncated) trailing fence — browsers render
  // partial/unbalanced HTML fine, so the panel can show the page taking shape live, and a
  // response cut off mid-file still previews what it got.
  return { files, previewHtml: buildPreviewHtml(files), remainingText };
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
