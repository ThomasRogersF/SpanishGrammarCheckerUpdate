/** PostCSS config for Tailwind v3 in an ESM project.
 * Use CommonJS (.cjs) to avoid "module is not defined in ES module scope".
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};