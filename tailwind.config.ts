import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'step-waiting': '#94a3b8',
        'step-ready': '#3b82f6',
        'step-running': '#eab308',
        'step-blocked': '#f97316',
        'step-done': '#22c55e',
        'step-skipped': '#64748b'
      }
    }
  },
  plugins: []
};
export default config;
