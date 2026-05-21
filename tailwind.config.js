/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#1a1d21',
          hover: '#27292d',
          active: '#1164a3',
          text: '#d1d2d3',
          muted: '#9b9b9b',
        },
        chat: {
          bg: '#1a1d21',
          input: '#222529',
          border: '#383838',
        },
        brand: {
          primary: '#1264a3',
          accent: '#e8912d',
        },
        commander: '#7c3aed',
        worker: '#059669',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
