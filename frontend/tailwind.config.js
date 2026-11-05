/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  // Preflight off: globals.css already has its own reset; keeps existing screens unchanged.
  corePlugins: { preflight: false },
  // Phones: hover styles only on devices that can hover, so taps don't leave buttons stuck highlighted
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      spacing: { 'btn-icon': 'var(--btn-icon-size)' },
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        foreground: 'var(--color-text-primary)',
        muted: 'var(--color-text-muted)',
      },
    },
  },
  plugins: [],
};
