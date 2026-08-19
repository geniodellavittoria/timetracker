import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readInitialTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

/**
 * Mirrors the `data-theme` attribute the inline script in index.html already
 * set before paint (avoiding a flash of the wrong theme), so this hook only
 * needs to read it once and keep it in sync from then on.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return [theme, setTheme];
}
