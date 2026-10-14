import { useState, useEffect } from 'react';
import { APP_NAME } from '@sprintflow/shared';

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">{APP_NAME}</h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label="Toggle theme"
        >
          Theme: {theme === 'light' ? 'Light' : 'Dark'}
        </button>
      </header>

      <main>
        <section className="card" aria-labelledby="status-heading">
          <div className="badge">
            <span className="status-dot" aria-hidden="true" />
            <span>Operational</span>
          </div>
          <h2 id="status-heading" className="card-title">
            SprintFlow Web Client
          </h2>
          <p className="card-desc">
            Vite React TypeScript workspace initialized with shared package linkage and design tokens.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
