import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16223a", teal: "#167a6c", tealsoft: "#e3f1f0",
        paper: "#fbfbf9", sand: "#f1efe9", line: "#dedbd2", slate: "#5b6577",
        mint: "#2cc7b0", night: "#0c1428", violet: "#7c6cf0",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(0.92)" }, "60%": { transform: "scale(1.03)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "check-pop": { "0%": { transform: "scale(0) rotate(-30deg)" }, "70%": { transform: "scale(1.25) rotate(6deg)" }, "100%": { transform: "scale(1) rotate(0)" } },
        ripple: { "0%": { transform: "scale(0)", opacity: "0.45" }, "100%": { transform: "scale(4)", opacity: "0" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        blob: { "0%,100%": { transform: "translate(0,0) scale(1)" }, "50%": { transform: "translate(18px,-22px) scale(1.15)" } },
        "slide-x": { "0%": { opacity: "0", transform: "translateX(-8px)" }, "100%": { opacity: "1", transform: "translateX(0)" } },
        "glow-pulse": { "0%,100%": { boxShadow: "0 0 0 0 rgba(44,199,176,0.45)" }, "50%": { boxShadow: "0 0 0 8px rgba(44,199,176,0)" } },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "pop-in": "pop-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
        "check-pop": "check-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        ripple: "ripple 0.65s ease-out forwards",
        float: "float 4s ease-in-out infinite",
        blob: "blob 9s ease-in-out infinite",
        "slide-x": "slide-x 0.3s ease-out both",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
    },
  },
} satisfies Config;
