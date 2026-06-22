import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sag: {
          bg: "#090b10",
          surface: "rgba(255,255,255,0.03)",
          elevated: "rgba(255,255,255,0.05)",
          border: "rgba(255,255,255,0.08)",
          muted: "#8b95a8",
          text: "#e8eaef",
          accent: "#9aa8be",
          glow: "#b4c0d4",
          star: "#e8eaef",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.24)",
      },
    },
  },
  plugins: [],
};

export default config;
