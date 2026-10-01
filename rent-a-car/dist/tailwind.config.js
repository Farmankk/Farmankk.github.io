/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#0c0d0e',
          dark: '#16181b',
          gray: '#64748b',
          light: '#f8fafc',
          accent: '#e11d48',
          gold: '#c29b38'
        }
      }
    }
  },
  plugins: []
};
