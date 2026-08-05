import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // SalesMate design system: an ink-navy ledger, not a SaaS-blue
        // dashboard. Parchment (warm, not gray) in light mode; true ink in
        // dark mode. Signal green stays reserved strictly for
        // revenue-positive states — never decorative.
        parchment: {
          50: "#faf8f4",
          100: "#f3efe6"
        },
        ledger: {
          50: "#faf8f4", // parchment surface, light mode base
          100: "#efeadf",
          200: "#d8d2c2",
          300: "#b3ab97",
          400: "#8b8677",
          500: "#68655c",
          600: "#4c4a44",
          700: "#332f2a",
          800: "#221f1c", // primary dark surface
          900: "#181613",
          950: "#0f0d0b"
        },
        ink: {
          // true near-black navy used only for the dark-mode base and text —
          // distinct from the warm ledger scale above
          900: "#12161d",
          950: "#0a0c11"
        },
        signal: {
          DEFAULT: "#1d8f5e",
          soft: "#e3f3ea"
        },
        alert: {
          DEFAULT: "#b8402f",
          soft: "#f8e9e6"
        },
        amber: {
          DEFAULT: "#a8781f",
          soft: "#f6efdd"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"]
      },
      borderRadius: {
        card: "10px"
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "card-hover": "0 4px 14px 0 rgb(15 23 42 / 0.08), 0 1px 3px 0 rgb(15 23 42 / 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
