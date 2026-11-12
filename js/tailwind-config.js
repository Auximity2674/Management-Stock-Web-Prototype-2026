// Tailwind Play CDN config — loaded right after the CDN script on every page.
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#FFF4EF', 100: '#FFE5D9', 200: '#FFC8B0', 300: '#FFA47F', 400: '#F8834F',
          500: '#F2683A', 600: '#DE5126', 700: '#B83F1C', 800: '#93341B', 900: '#772E1A',
        },
        ink: {
          50: '#F5F6F8', 100: '#ECEEF2', 200: '#DADDE5', 300: '#B9BEC9', 400: '#8E94A3',
          500: '#6B7180', 600: '#4E5361', 700: '#363A45', 800: '#23252D', 900: '#17181C',
        },
        iris: { 50: '#EEF0FF', 100: '#DFE3FF', 400: '#7B86F2', 500: '#5865E8', 600: '#4450D4' },
      },
    },
  },
}
