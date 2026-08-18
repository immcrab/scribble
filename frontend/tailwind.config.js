/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warm charcoal + blue palette, values pulled directly from Arena.ai's
        // own CSS custom properties (--background, --card, --border,
        // --brand-blue, etc.) rather than eyeballed from screenshots.
        base: {
          950: "#1b1a18", // outer app shell — a shade below Arena's own bg for depth
          900: "#252523", // Arena --background / --sidebar-background
          850: "#23211f", // Arena --popover / --sidebar-accent
          800: "#33302e", // Arena --card / --surface-secondary
          700: "#413d39", // Arena --border
          600: "#524d47", // Arena --border-medium
          500: "#68615a", // Arena --neutral-9 (muted)
        },
        // Monochrome accent — no blue. Mirrors Arena's own minimal look, where
        // the only real "color" is a bright off-white highlight against the
        // warm charcoal surfaces; red/emerald stay for error/success only.
        accent: {
          400: "#ffffff",
          500: "#f5f0eb",
          600: "#d5cdc3",
          700: "#9c9891",
          glow: "#f5f0eb",
        },
        slate: {
          100: "#f5f0eb", // Arena --brand-neutral-3 (primary text)
          200: "#e7e1da", // Arena --text-secondary
          300: "#c7c2bc", // Arena --text-tertiary
          400: "#9c9891", // Arena --brand-neutral-7
          500: "#827c73", // Arena --brand-neutral-8
          600: "#4c4743", // Arena --brand-neutral-10
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["'Source Serif 4'", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(245,240,235,0.12), 0 8px 30px -8px rgba(245,240,235,0.25)",
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
      },
    },
  },
  plugins: [],
};
