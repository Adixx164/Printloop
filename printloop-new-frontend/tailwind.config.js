/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // ── Six-ink press palette ──────────────────────────────────────────
      // The old editorial names are KEPT but re-pointed at the six-ink
      // values, so every existing `bg-paper` / `text-ink` / `border-
      // persimmon` usage recolors without a file-by-file rename.
      colors: {
        ink: "#17140F", // toner
        paper: "#F9FBFF", // sheet (page background)
        "paper-light": "#FFFFFF", // paper (cards / raised surfaces)
        "paper-deep": "#E3E8F0", // hairline
        "paper-warm": "#F1F5FC", // stub / note tint
        persimmon: "#0077C8", // process (primary)
        ochre: "#C7944A", // warning / ochre (kept)
        sage: "#6B7A5C", // kept (no six-ink equivalent)
        fog: "#6E6A61", // muted
        // Six-ink names, directly usable too:
        sheet: "#F9FBFF",
        toner: "#17140F",
        "ink-soft": "#3B372F",
        process: "#0077C8",
        "process-ink": "#005E9E",
        register: "#CE2B37",
        highlight: "#FFD400",
        pass: "#177245",
        hairline: "#E3E8F0",
      },
      fontFamily: {
        // Six-ink: display + data are Archivo; body is IBM Plex Sans.
        serif: ['"Archivo"', '"Helvetica Neue"', "Arial", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Archivo"', '"Helvetica Neue"', "Arial", "sans-serif"],
        display: ['"Archivo"', '"Helvetica Neue"', "Arial", "sans-serif"],
        data: ['"Archivo"', '"Helvetica Neue"', "Arial", "sans-serif"],
      },
      letterSpacing: {
        editorial: "0.2em",
      },
      // ── Evolved-direction motion + form tokens ─────────────────────────
      // The expressive ease (overshoot-free spring) is the new default for
      // softer hover/lift interactions; `ease-snap` stays available for
      // tight tap targets.
      transitionTimingFunction: {
        expressive: "cubic-bezier(0.16, 1, 0.3, 1)",
        snap: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      // Six-ink radius scale — tight, press-sharp corners.
      borderRadius: {
        "pl-sm": "2px",
        pl: "3px",
        "pl-lg": "4px",
        "pl-xl": "6px",
      },
      // Six-ink shadows — HARD offsets in the ticket tint, never blurred.
      boxShadow: {
        soft: "4px 4px 0 #E3E9F4",
        "soft-md": "6px 6px 0 #E3E9F4",
        "soft-lg": "10px 10px 0 #E3E9F4",
        "soft-xl": "12px 12px 0 #E3E9F4",
      },
      transitionDuration: {
        snap: "180ms",
        expressive: "360ms",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-soft": {
          "0%,100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.5" },
        },
        "pulse-ring": {
          "0%,100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(0,119,200,0.5)" },
          "50%": { transform: "scale(1.08)", boxShadow: "0 0 0 12px rgba(0,119,200,0)" },
        },
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0.3" },
        },
        fadein: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // New: gentler entrance with a longer drift; for hero sections.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
        blink: "blink 1.2s steps(2, start) infinite",
        fadein: "fadein 0.5s ease",
        "rise-in": "rise-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
