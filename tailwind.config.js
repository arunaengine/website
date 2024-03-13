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
        aruna: {
          50: '#C9F0F8',
          100: '#B1EFFC',
          200: '#90e0ef',
          300: '#6ED8ED',
          400: '#43CAE5',
          500: '#00B4D8',
          600: '#00A0CC',
          700: '#007BC2',
          800: '#005299',
          900: '#00208A',
          950: '#0E0075'
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require('preline/plugin'),
  ],
}