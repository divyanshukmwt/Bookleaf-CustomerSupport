import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          50: '#fff4f3',
          100: '#ffe6e3',
          200: '#ffcbc5',
          300: '#f7a69b',
          400: '#ee8175',
          500: '#e96d61',
          600: '#dc5d52',
          700: '#b9473e',
          800: '#973d36',
          900: '#7d3732',
        },
      },
    },
  },
  plugins: [],
};
export default config;
