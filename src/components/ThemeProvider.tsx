import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getStoredTheme, setStoredTheme } from '../lib/theme-storage';

type Theme = 'light' | 'dark' | 'system' | 'ymir';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const loadTheme = async () => {
      const stored = await getStoredTheme();
      if (stored && (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'ymir')) {
        setThemeState(stored);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    const updateActualTheme = () => {
      let resolved: 'light' | 'dark';
      if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        resolved = theme === 'dark' || theme === 'ymir' ? 'dark' : 'light';
      }
      setActualTheme(resolved);

      const root = document.documentElement;
      root.classList.remove('light', 'dark', 'theme-ymir');
      
      if (theme === 'system') {
        root.classList.add(resolved);
      } else if (theme === 'ymir') {
        root.classList.add('theme-ymir');
      } else {
        root.classList.add(theme);
      }
    };

    updateActualTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      if (theme === 'system') {
        updateActualTheme();
      }
    };
    mediaQuery.addEventListener('change', handleThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    await setStoredTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
