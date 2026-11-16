/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 60% Dominant canvas / dark background (CSS variables for white-label theming)
        canvas: {
          950: 'rgb(var(--color-canvas-950) / <alpha-value>)',
          900: 'rgb(var(--color-canvas-900) / <alpha-value>)',
          850: 'rgb(var(--color-canvas-850) / <alpha-value>)',
        },
        // 30% Secondary structure, cards, borders and neutral surfaces
        surface: {
          card: 'rgb(var(--color-surface-card) / <alpha-value>)',
          cardHover: 'rgb(var(--color-surface-card-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-surface-subtle) / <alpha-value>)',
          border: 'rgb(var(--color-surface-border) / <alpha-value>)',
          borderSubtle: 'rgb(var(--color-surface-border-subtle) / <alpha-value>)',
          muted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
        },
        // 10% Accent color
        accent: {
          400: 'rgb(var(--color-accent-400) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)',
          700: 'rgb(var(--color-accent-700) / <alpha-value>)',
          foreground: 'rgb(var(--color-on-accent) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
};
