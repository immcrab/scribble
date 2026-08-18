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
  return !!only && only.content.split("\n").length >= 8;
}
