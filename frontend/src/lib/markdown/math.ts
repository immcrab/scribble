import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** KaTeX + its CSS/fonts, split into their own chunk — only math-enabled Markdown loads it. */
export const mathPlugins = { remarkMath, rehypeKatex };
export type MathPlugins = typeof mathPlugins;
