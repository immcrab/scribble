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
        accent: {
          400: "#4dacff", // Arena --brand-blue-5 (hover)
          500: "#299bff", // Arena --brand-blue (primary)
          600: "#077fe9",
          700: "#0b61ad", // Arena --brand-blue-8
          glow: "#299bff",
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
        glow: "0 0 0 1px rgba(59,130,246,0.15), 0 8px 30px -8px rgba(59,130,246,0.35)",
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
        blink: {
          "0%, 49%": { opacity: 1 },
          "50%, 100%": { opacity: 0 },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        blink: "blink 1s step-start infinite",
        shimmer: "shimmer 1.8s linear infinite",
      },
    },
  },
  plugins: [],
};
