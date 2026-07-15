import type { Config } from 'tailwindcss';

// Design-system foundation (spec/07-dashboard-ux-ui.md). Tokens expand in M1 with shadcn/ui.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mission Control dark surface (doc 07 §5). Placeholder tokens — refine in M1.
        surface: '#0b0f17',
        panel: '#131a26',
        edge: '#1e2836',
        muted: '#7a8699',
        accent: '#4f7cff',
      },
    },
  },
  plugins: [],
};

export default config;
