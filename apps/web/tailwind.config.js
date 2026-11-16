/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
        },
        // Legacy brand alias directed to accent
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: 'rgb(var(--color-accent-400) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)',
          700: 'rgb(var(--color-accent-700) / <alpha-value>)',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
    },
  },
  plugins: [],
}
