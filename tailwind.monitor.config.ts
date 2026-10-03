import type { Config } from "tailwindcss";

/**
 * Tailwind del monitor de operaciones (/monitor), separado del de la app.
 *
 * El diseño lo genera Google Stitch (proyecto "Kredired Operations Admin
 * Console", sistema "Obsidian Telemetry") y trae su propia paleta con
 * nombres que chocan con los de la app (primary, secondary, surface…). Para
 * respetar su CSS tal cual sin tocar la app, este config:
 *  - solo escanea los archivos del monitor,
 *  - se aplica únicamente dentro de `#monitor` (`important`), así gana a
 *    las clases homónimas de la app sin filtrarse fuera,
 *  - no repite el preflight (ya lo pone globals.css).
 *
 * `theme.extend` es copia literal del `tailwind.config` que exporta Stitch.
 */
const config: Config = {
  content: [
    "./src/app/monitor/**/*.{ts,tsx}",
    "./src/components/monitor/**/*.{ts,tsx}",
  ],
  important: "#monitor",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        "tertiary-fixed": "#ffddb8",
        "on-error-container": "#ffdad6",
        "on-tertiary-fixed-variant": "#653e00",
        "inverse-primary": "#005ac1",
        "tertiary-container": "#ca8100",
        "secondary-container": "#00a572",
        primary: "#adc6ff",
        "on-background": "#dce2f6",
        "on-tertiary": "#472a00",
        error: "#ffb4ab",
        "on-primary": "#002e69",
        "on-tertiary-container": "#3e2400",
        "surface-bright": "#323949",
        "secondary-fixed-dim": "#4edea3",
        "on-secondary": "#003824",
        "surface-container": "#19202e",
        "secondary-fixed": "#6ffbbe",
        "surface-variant": "#2e3544",
        "on-secondary-container": "#00311f",
        "on-primary-container": "#00285c",
        outline: "#8b90a0",
        "surface-tint": "#adc6ff",
        "surface-container-highest": "#2e3544",
        surface: "#0c1321",
        "on-primary-fixed": "#001a41",
        "on-surface": "#dce2f6",
        "on-tertiary-fixed": "#2a1700",
        "error-container": "#93000a",
        "on-error": "#690005",
        "surface-container-high": "#232a39",
        secondary: "#4edea3",
        "inverse-on-surface": "#2a3040",
        "primary-fixed": "#d8e2ff",
        background: "#0c1321",
        "inverse-surface": "#dce2f6",
        "on-secondary-fixed": "#002113",
        "outline-variant": "#414754",
        "on-primary-fixed-variant": "#004494",
        "on-secondary-fixed-variant": "#005236",
        "surface-dim": "#0c1321",
        "surface-container-low": "#151b2a",
        "primary-container": "#4c8eff",
        "tertiary-fixed-dim": "#ffb95f",
        tertiary: "#ffb95f",
        "surface-container-lowest": "#070e1c",
        "on-surface-variant": "#c1c6d7",
        "primary-fixed-dim": "#adc6ff",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        "margin-desktop": "2rem",
        "space-lg": "1.25rem",
        "gutter-desktop": "1.5rem",
        "space-md": "0.75rem",
        gutter: "1rem",
        "space-sm": "0.5rem",
        "space-xl": "2rem",
        "space-xs": "0.25rem",
        margin: "1rem",
      },
      fontFamily: {
        "label-xs": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "metric-num": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "title-md": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "label-sm": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "body-lg": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "headline-lg": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "headline-sm": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "body-sm": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "body-md": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "code-sm": ["JetBrains Mono", "ui-monospace", "monospace"],
        "headline-md": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        "display-lg": ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "label-xs": [
          "10px",
          { lineHeight: "12px", letterSpacing: "0.06em", fontWeight: "600" },
        ],
        "metric-num": [
          "22px",
          { lineHeight: "26px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "title-md": [
          "14px",
          { lineHeight: "20px", letterSpacing: "-0.005em", fontWeight: "600" },
        ],
        "label-sm": [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "500" },
        ],
        "body-lg": [
          "15px",
          { lineHeight: "22px", letterSpacing: "0em", fontWeight: "400" },
        ],
        "headline-lg": [
          "24px",
          { lineHeight: "30px", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        "headline-sm": [
          "16px",
          { lineHeight: "22px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "body-sm": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "400" },
        ],
        "body-md": [
          "13px",
          { lineHeight: "18px", letterSpacing: "0em", fontWeight: "400" },
        ],
        "code-sm": [
          "11px",
          { lineHeight: "16px", letterSpacing: "0em", fontWeight: "500" },
        ],
        "headline-md": [
          "20px",
          { lineHeight: "26px", letterSpacing: "-0.015em", fontWeight: "600" },
        ],
        "display-lg": [
          "32px",
          { lineHeight: "38px", letterSpacing: "-0.03em", fontWeight: "700" },
        ],
      },
    },
  },
};

export default config;
