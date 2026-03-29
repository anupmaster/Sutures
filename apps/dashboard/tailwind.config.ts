import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#10B981",
          hover: "#059669",
        },
        state: {
          idle: "#6B7280",
          thinking: "#F59E0B",
          acting: "#3B82F6",
          paused: "#EF4444",
          completed: "#10B981",
        },
        memory: {
          stm: "#10B981",
          mtm: "#F59E0B",
          ltm: "#8B5CF6",
          shared: "#3B82F6",
          stale: "#EF4444",
        },
        pressure: {
          safe: "#10B981",
          high: "#F59E0B",
          cliff: "#EF4444",
        },
        surface: {
          bg: "#0A0A0B",
          secondary: "#111113",
          elevated: "#1A1A1D",
          DEFAULT: "#222225",
        },
        text: {
          primary: "#F5F5F5",
          secondary: "#A1A1AA",
          muted: "#71717A",
        },
      },
      fontFamily: {
        display: ["JetBrains Mono", "monospace"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
