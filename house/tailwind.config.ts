import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sag: {
          void: "#05060f",
          panel: "#0c1020",
          star: "#f5f0dc",
          glow: "#7eb8ff",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        nebula: "0 0 40px rgba(126, 184, 255, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
