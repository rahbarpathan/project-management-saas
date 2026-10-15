import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle Component', () => {
  it('renders theme toggle button with accessible aria-label', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toBeInTheDocument();
  });

  it('toggles theme on click and updates localStorage and DOM attributes', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /toggle theme/i });

    // Initial state: system mode
    expect(localStorage.getItem('sprintflow-theme')).toBeNull();

    // 1st click: system -> light
    fireEvent.click(button);
    expect(localStorage.getItem('sprintflow-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // 2nd click: light -> dark
    fireEvent.click(button);
    expect(localStorage.getItem('sprintflow-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // 3rd click: dark -> system
    fireEvent.click(button);
    expect(localStorage.getItem('sprintflow-theme')).toBe('system');
  });

  it('restores persisted theme preference from localStorage on mount', () => {
    localStorage.setItem('sprintflow-theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
