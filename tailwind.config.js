/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
    'node_modules/preline/dist/*.js',
  ],
  theme: {
    container: {
      padding: '2rem',
    },
    extend: {
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        dark: '#000000',
        darkPrimary: '#182433',
        darkSecondary: '#004E63',
        light: '#ffffff',
        lightPrimary: '#ffffff',
        lightSecondary: '#dddddd',
        main: '#0073FF',
        white: '#FFFFFF',
        arunaPrimary: '#0054a6'
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require('preline/plugin'),
  ],
}