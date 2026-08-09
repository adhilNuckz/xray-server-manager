/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0b0f16',
          50: '#f4f6fa',
          100: '#e6eaf2',
          200: '#c7cede',
          300: '#9aa4bd',
          400: '#6b7593',
          500: '#4c5570',
          600: '#374057',
          700: '#232a3b',
          800: '#161c29',
          900: '#0f141e',
          950: '#0b0f16',
        },
        accent: {
          DEFAULT: '#6366f1',
          50: '#eef0ff',
          100: '#e0e2ff',
          200: '#c6c9ff',
          300: '#a3a5ff',
          400: '#8385fb',
          500: '#6366f1',
          600: '#4c4de3',
          700: '#3f3ec8',
          800: '#3433a1',
          900: '#2f307f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.4), 0 1px 3px 1px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};
