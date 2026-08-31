import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-scribble">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Links in a model's reply open in a new tab — following one in place
          // would navigate away from the chat and lose the composer's state.
          a({ node: _node, children, href, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...props}>
                {children}
              </a>
            );
          },
          code({ node, className, children, ref: _ref, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && node?.position?.start.line === node?.position?.end.line;
            const codeText = String(children).replace(/\n$/, "");

            if (isInline) {
              return <code className={className} {...props}>{children}</code>;
            }

            // Block code — add a copy-to-clipboard button (tappable on mobile)
            return (
              <div className="code-block-wrapper relative">
                <div className="code-block-header flex items-center justify-between rounded-t-lg border-b border-base-700 bg-base-900/60 px-3 py-1.5">
                  {match && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {match[1]}
                    </span>
                  )}
                  <CopyButton text={codeText} />
                </div>
                <pre className={className} {...props}>
                  {children}
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard not available
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="message-action-btn flex items-center justify-center rounded-md p-1 text-xs text-slate-500 transition-colors hover:bg-base-700/60 hover:text-white"
      title="Copy code"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}
