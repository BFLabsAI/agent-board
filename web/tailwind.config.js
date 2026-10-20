/** Tokens espelhados em design-system/MASTER.md */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { 0: "#06060a", 1: "#0c0c14", 2: "#13131e", 3: "#1a1a28", 4: "#222233", 5: "#2a2a3d" },
        border: { DEFAULT: "#2a2a3d", light: "#363650" },
        accent: { DEFAULT: "#6366f1", hover: "#818cf8", muted: "rgba(99, 102, 241, 0.15)" },
        texto: { DEFAULT: "#e4e4ed", suave: "#9ca3af", fraco: "#6b7280" },
        papel: { master: "#f59e0b", manager: "#6366f1", researcher: "#10b981" },
        status: {
          trabalhando: "#34d399",
          esperando: "#fbbf24",
          pendente: "#fb923c",
          parado: "#94a3b8",
          offline: "#64748b",
          desconhecido: "#475569",
        },
        tarefa: {
          aberto: "#60a5fa",
          em_andamento: "#818cf8",
          atrasado: "#f87171",
          concluido: "#2dd4bf",
          aguardando_revisao: "#fbbf24",
          aprovado: "#34d399",
          rejeitado: "#fb7185",
        },
        msg: {
          pedido: "#60a5fa",
          andamento: "#a78bfa",
          entrega: "#34d399",
          resposta: "#2dd4bf",
          rejeicao: "#fb7185",
          nota: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "Consolas", "monospace"],
      },
      borderRadius: { card: "0.75rem" },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(99,102,241,0.35), 0 0 24px -4px rgba(99,102,241,0.35)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-dot": "pulseDot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};
