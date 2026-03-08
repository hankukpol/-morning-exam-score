import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#F7F4EF",
        ember: "#C55A11",
        forest: "#1F4D3A",
        sand: "#E7D8C9",
        slate: "#4B5563",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(17, 24, 39, 0.08)",
      },
      backgroundImage: {
        "hero-grid":
          "linear-gradient(rgba(17,24,39,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
