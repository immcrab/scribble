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
        glow: "0 0 0 1px rgb(var(--accent-500) / 0.12), 0 8px 30px -8px rgb(var(--accent-500) / 0.25)",
        panel: "0 4px 24px -4px rgba(0,0,0,0.5)",
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
        "pulse-dot-a": {
          "0%, 100%": { opacity: 0.25, transform: "scale(0.85)" },
          "50%": { opacity: 1, transform: "scale(1.1)" },
        },
        "pulse-dot-b": {
          "0%, 100%": { opacity: 0.25, transform: "scale(0.85)" },
          "50%": { opacity: 1, transform: "scale(1.1)" },
        },
        "pulse-dot-c": {
          "0%, 100%": { opacity: 0.25, transform: "scale(0.85)" },
          "50%": { opacity: 1, transform: "scale(1.1)" },
        },
        // A soft ripple/glow that radiates from the assistant avatar while a
        // turn is streaming, signalling "alive" at a glance.
        "avatar-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0px rgba(245,240,235,0)" },
          "50%": { boxShadow: "0 0 0 6px rgba(245,240,235,0.1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Text-shimmer used by the live "Thinking for Ns" label — a soft light
        // band sweeping through the label text, replacing the plain pulsing dots.
        "thinking-shimmer": {
          "0%": { backgroundPosition: "150% 0" },
          "100%": { backgroundPosition: "-150% 0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        "cursor-breathe": "cursor-breathe 1.2s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.4s ease-in-out 0ms infinite",
        "pulse-dot-a": "pulse-dot 1.4s ease-in-out 0ms infinite",
        "pulse-dot-b": "pulse-dot 1.4s ease-in-out 220ms infinite",
        "pulse-dot-c": "pulse-dot 1.4s ease-in-out 440ms infinite",
        "avatar-glow": "avatar-glow 2.2s ease-in-out infinite",
        blink: "blink 1s step-start infinite",
        shimmer: "shimmer 1.8s linear infinite",
        "thinking-shimmer": "thinking-shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
};
