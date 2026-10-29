/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Condensed cut used like station signage: station names, train numbers, big figures.
        display: ['"Barlow Condensed"', 'Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F5F7FA',
        line: '#E2E8F0',
        ink: {
          DEFAULT: '#0F1E3D',
          700: '#2A3B5E',
          500: '#52637F',
          400: '#74839D',
          300: '#A3AFC3',
          200: '#CBD3E0',
        },
        // Primary accent: signal blue
        rail: {
          50: '#EEF3FF',
          100: '#DCE6FF',
          200: '#BCD0FF',
          500: '#2F6BFF',
          600: '#1D55E6',
          700: '#1745B8',
        },
        // Operational / completed
        go: { 50: '#E8F6EF', 100: '#CDEBDD', 500: '#1E9E6A', 600: '#14804F', 700: '#0F6840' },
        // Warnings / upcoming departures
        warn: { 50: '#FFF6E0', 100: '#FFE7AE', 500: '#E3A008', 600: '#B26A00', 700: '#7A4A00' },
        // Errors / stopped / cancelled
        stop: { 50: '#FDECEC', 100: '#F9D0CF', 500: '#E5484D', 600: '#C62828', 700: '#A11D1D' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 30, 61, 0.04), 0 6px 18px -8px rgba(15, 30, 61, 0.10)',
        pop: '0 12px 40px -12px rgba(15, 30, 61, 0.28), 0 2px 6px rgba(15, 30, 61, 0.06)',
      },
      borderRadius: {
        card: '16px',
      },
      keyframes: {
        'marker-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'marker-ring': 'marker-ring 2.2s ease-out infinite',
        'modal-in': 'modal-in 160ms ease-out',
        'toast-in': 'toast-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
