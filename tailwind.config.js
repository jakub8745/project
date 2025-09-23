/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        gallery: {
          dark: '#121212',
          card: '#1e1e1e',
          accent: '#6366f1',
          text: '#f3f4f6',
          muted: '#9ca3af',
        }
      },
      fontFamily: {
        //sans: ['Alan Sans', 'sans-serif'], 
        sans: ['Xanh Mono', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        flash: 'flash 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
};
