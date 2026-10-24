import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'ragseal.theme';

/** The theme index.html already applied before React loaded (saved choice, else the OS setting). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Colour-only transition for the switch itself, removed afterwards so it never slows other UI.
  root.classList.add('theme-transition');
  root.dataset.theme = theme;
  window.setTimeout(() => root.classList.remove('theme-transition'), 260);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable: the choice lasts for this page load only
  }
}

/** Sun/moon switch for the sidebar footer. */
export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Follow the OS setting until the person picks a theme themselves.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      saved = null;
    }
    if (saved) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="mt-2 flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-[13px] text-[var(--ink-1)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ink)_3%,transparent)] lg:justify-start"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
      <span className="hidden lg:inline">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
    </button>
  );
};
