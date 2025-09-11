export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
  // Specify the source filename to avoid PostCSS warnings about missing `from`
  // when processing CSS. Using `undefined` tells PostCSS not to expect a file
  // path and suppresses the warning.
  options: {
    from: undefined,
  },
};
