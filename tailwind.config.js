/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        craftable: {
          blue: '#0077B5',
          navy: '#1E3A5F',
          green: '#3AAA35',
          orange: '#F7941D',
          coral: '#FF6B6B',
        },
      },
    },
  },
  plugins: [],
}
