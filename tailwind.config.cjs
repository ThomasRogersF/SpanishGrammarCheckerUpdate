/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Kumbh Sans"', 'system-ui', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        brand: {
          orange: 'hsl(var(--brand-orange))',   // 17 100% 54%
          teal: 'hsl(var(--brand-teal))',       // 165 77% 47%
          warm: 'hsl(var(--brand-warm))',       // 39 33% 95%
          dark: 'hsl(var(--brand-dark))',       // 240 5% 12%
        },
      },
      borderRadius: {
        card: '1rem',      // 16px
        pill: '2rem',      // 32px
      },
      boxShadow: {
        soft: '0 10px 20px rgba(30,30,30,0.06)',
        lg: '0 20px 40px rgba(30,30,30,0.08)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        spinSoft: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
        spinSoft: 'spinSoft 1s linear infinite',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      });
    },
  ],
};