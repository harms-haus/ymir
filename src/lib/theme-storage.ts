import logger from './logger';

const THEME_KEY = 'ymir-theme';

export async function getStoredTheme(): Promise<string | null> {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const theme = localStorage.getItem(THEME_KEY);
    return theme || null;
  } catch (error) {
    logger.error('Failed to get stored theme', { error });
    return null;
  }
}

export async function setStoredTheme(theme: string): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    logger.error('Failed to save theme', { error });
    throw error;
  }
}
