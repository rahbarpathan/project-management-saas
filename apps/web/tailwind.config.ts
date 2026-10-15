import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          focus: 'var(--color-focus)',
        },
        text: {
          primary: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          contrast: 'var(--color-accent-contrast)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
          surface: 'var(--color-danger-surface)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          surface: 'var(--color-success-surface)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          surface: 'var(--color-warning-surface)',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm, 4px)',
        DEFAULT: 'var(--radius-md, 6px)',
        md: 'var(--radius-md, 6px)',
        lg: 'var(--radius-lg, 8px)',
        xl: 'var(--radius-xl, 12px)',
      },
    },
  },
  plugins: [],
};

export default config;
