/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        gh: {
          base:  '#0d1117',
          nav:   '#161b22',
          card:  '#1c2128',
          over:  '#21262d',
          text:  '#e6edf3',
          muted: '#7d8590',
        },
      },
      keyframes: {
        'badge-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.5)' },
          '50%': { boxShadow: '0 0 0 5px rgba(239,68,68,0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'badge-pulse': 'badge-pulse 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.25s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
