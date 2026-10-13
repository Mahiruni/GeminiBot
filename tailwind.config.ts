import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          bg: '#07090E',
          surface: '#0F1420',
          elevated: '#171E30',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        neon: {
          emerald: '#10B981',
          crimson: '#F43F5E',
          cyan: '#38BDF8',
          amber: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 24px -4px rgba(16, 185, 129, 0.35)',
        'glow-crimson': '0 0 24px -4px rgba(244, 63, 94, 0.35)',
        'glow-cyan': '0 0 24px -4px rgba(56, 189, 248, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
