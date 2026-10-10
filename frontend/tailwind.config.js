/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Values live as RGB-channel CSS custom properties in src/styles/index.css
        // (`:root` = dark, `.light` = light) so every `bg-base-850/70`-style opacity
        // utility keeps working while the whole palette flips with the theme toggle.
        // Dark defaults, for reference: base-950 #1b1a18 … base-500 #68615a,
        // accent-400 #ffffff … accent-700 #9c9891, slate-100 #f5f0eb … slate-600 #4c4743.
        base: {
          950: "rgb(var(--base-950) / <alpha-value>)",
          900: "rgb(var(--base-900) / <alpha-value>)",
          850: "rgb(var(--base-850) / <alpha-value>)",
          800: "rgb(var(--base-800) / <alpha-value>)",
          700: "rgb(var(--base-700) / <alpha-value>)",
          600: "rgb(var(--base-600) / <alpha-value>)",
          500: "rgb(var(--base-500) / <alpha-value>)",
        },
        // Monochrome accent — no blue, in either theme.
        accent: {
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          glow: "rgb(var(--accent-500) / <alpha-value>)",
        },
        slate: {
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        // Layered, theme-aware elevation. --shadow-rgb flips between the dark and
        // light palettes (src/styles/index.css) so light mode gets soft warm shadows
        // instead of heavy black ones.
        panel: "0 1px 2px rgb(var(--shadow-rgb) / 0.16), 0 12px 32px -10px rgb(var(--shadow-rgb) / 0.42)",
        lift: "0 2px 4px rgb(var(--shadow-rgb) / 0.14), 0 14px 28px -12px rgb(var(--shadow-rgb) / 0.4)",
        pop: "0 2px 6px rgb(var(--shadow-rgb) / 0.2), 0 24px 56px -14px rgb(var(--shadow-rgb) / 0.55)",
      },
      transitionTimingFunction: {
        // Shared motion curves — fast-out for entrances, springy overshoot for
        // small interactive pops, symmetrical for state changes.
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "in-out-soft": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: 0, transform: "translateY(6px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        // Popup menu grow-in with a slight overshoot, anchored to its bottom-left corner.
        "pop-up": {
          "0%": { opacity: 0, transform: "translateY(10px) scale(0.9)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
        },
        // Soft, breathing cursor — gentler than a hard on/off blink so a live
        // stream feels calm rather than frantic.
        "cursor-breathe": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.15 },
        },
        // Per-dot pulse for the "Responding…" thinking indicator, staggered via
        // [animation-delay] on each child.
        "pulse-dot": {
          "0%, 100%": { opacity: 0.25, transform: "scale(0.85)" },
          "50%": { opacity: 1, transform: "scale(1.1)" },
        },
        // Menu / popover entrance: small rise + scale from the trigger side.
        "menu-in": {
          "0%": { opacity: 0, transform: "translateY(-4px) scale(0.97)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
        },
        "menu-in-up": {
          "0%": { opacity: 0, transform: "translateY(4px) scale(0.97)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
        },
        // Bottom sheet slide for mobile menus.
        "sheet-in": {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        // Small confirmation pop (selected check, copied tick, toggled chip).
        "pop-in": {
          "0%": { opacity: 0, transform: "scale(0.4)" },
          "60%": { opacity: 1, transform: "scale(1.15)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: 0, transform: "translateX(12px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
        // Solid-color breathing used instead of a gradient sweep for skeletons/labels.
        breathe: {
          "0%, 100%": { opacity: 0.55 },
          "50%": { opacity: 1 },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Live "Thinking for Ns" label: the text eases between a muted and a
        // bright tone — a solid-color pulse, no gradient sweep.
        "thinking-shimmer": {
          "0%, 100%": { color: "rgb(var(--slate-500))" },
          "50%": { color: "rgb(var(--slate-200))" },
        },
        // Generated images develop like a print: blur + slight zoom settle into focus.
        "image-reveal": {
          "0%": { opacity: 0, filter: "blur(12px) saturate(0.4)", transform: "scale(0.97)" },
          "100%": { opacity: 1, filter: "blur(0) saturate(1)", transform: "scale(1)" },
        },
        // Heading words rise in one after another.
        "word-rise": {
          "0%": { opacity: 0, transform: "translateY(0.35em)", filter: "blur(4px)" },
          "100%": { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        },
        // Playful nudge for easter eggs and error shakes.
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-9deg)" },
          "40%": { transform: "rotate(7deg)" },
          "60%": { transform: "rotate(-5deg)" },
          "80%": { transform: "rotate(3deg)" },
        },
        "barrel-roll": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "confetti-fall": {
          "0%": { transform: "translate3d(0, -10vh, 0) rotate(0deg)", opacity: 1 },
          "100%": { transform: "translate3d(var(--drift, 0px), 105vh, 0) rotate(var(--spin, 540deg))", opacity: 0.9 },
        },
        "toast-in": {
          "0%": { opacity: 0, transform: "translate(-50%, 16px) scale(0.92)" },
          "100%": { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "menu-in": "menu-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "menu-in-up": "menu-in-up 0.18s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "sheet-in": "sheet-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "pop-in": "pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
        "slide-in-right": "slide-in-right 0.32s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        breathe: "breathe 1.8s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "pop-up": "pop-up 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "cursor-breathe": "cursor-breathe 1.2s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.4s ease-in-out 0ms infinite",
        "pulse-dot-a": "pulse-dot 1.4s ease-in-out 0ms infinite",
        "pulse-dot-b": "pulse-dot 1.4s ease-in-out 220ms infinite",
        "pulse-dot-c": "pulse-dot 1.4s ease-in-out 440ms infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "thinking-shimmer": "thinking-shimmer 2.2s ease-in-out infinite",
        "image-reveal": "image-reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        "word-rise": "word-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        wiggle: "wiggle 0.6s ease-in-out",
        "barrel-roll": "barrel-roll 1s cubic-bezier(0.65, 0, 0.35, 1)",
        "confetti-fall": "confetti-fall 2.6s cubic-bezier(0.25, 0.6, 0.4, 1) forwards",
        "toast-in": "toast-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
        "float-y": "float-y 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
