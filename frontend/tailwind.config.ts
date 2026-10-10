import type { Config } from 'tailwindcss';

// One brand palette for the whole portal: a restrained leaf green on neutral slate, with amber/red/green
// reserved for warning/failure/success states. It is a design choice inspired by the BookLeaf name; it was
// NOT sampled from bookleafpub.in. To re-theme, change only the `brand` scale below.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8f3', 100: '#dcefe1', 200: '#b9dfc4', 300: '#8cc9a0', 400: '#55ab76',
          500: '#2f8f58', 600: '#1f7a47', 700: '#19633b', 800: '#174f31', 900: '#143f29',
        },
      },
      fontFamily: { display: ['Georgia', "'Times New Roman'", 'serif'] },
    },
  },
  plugins: [],
};
export default config;
