import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const handleNextTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  return (
    <button
      type="button"
      onClick={handleNextTheme}
      className={`inline-flex items-center justify-center p-2 rounded-md border border-border bg-surface text-text hover:bg-surface-hover hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${className}`}
      aria-label={`Toggle theme (Current: ${theme})`}
      title={`Theme: ${theme.toUpperCase()}`}
    >
      {resolvedTheme === 'dark' ? (
        // Moon Icon
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun Icon
        <svg
          className="w-5 h-5 text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
      <span className="sr-only">Toggle theme (Current: {theme})</span>
    </button>
  );
}
