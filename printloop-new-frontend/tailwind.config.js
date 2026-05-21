/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1A1410",
        paper: "#F8F4ED",
        "paper-light": "#FFFEFA",
        persimmon: "#D14B2C",
        ochre: "#C7944A",
        sage: "#6B7A5C",
        fog: "#888888",
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      letterSpacing: {
        editorial: "0.2em",
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
          "0%,100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(209,75,44,0.5)" },
          "50%": { transform: "scale(1.08)", boxShadow: "0 0 0 12px rgba(209,75,44,0)" },
        },
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0.3" },
        },
        fadein: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 32s linear infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
        blink: "blink 1.2s steps(2, start) infinite",
        fadein: "fadein 0.5s ease",
      },
    },
  },
  plugins: [],
};
