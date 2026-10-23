module.exports = {
  content: ['./index.html', './assets/catalogue-renderer.js', './scripts/lib/pages.mjs'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f7f7f6',
          100: '#efefec',
          200: '#dedede',
          800: '#232321',
          900: '#141413',
          accent: '#9a7b56',
          accentLight: '#c2a683',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        display: ['Cinzel', 'serif'],
      },
    },
  },
};
