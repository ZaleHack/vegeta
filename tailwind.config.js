import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: colors.red,
        indigo: colors.rose,
        purple: colors.red,
      },
    },
  },
  plugins: [],
};
