import { load } from '@tauri-apps/plugin-store';

const THEME_STORE_PATH = '.theme.json';

let themeStore: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!themeStore) {
    themeStore = await load(THEME_STORE_PATH, { defaults: {}, autoSave: true });
  }
  return themeStore;
}

export async function getStoredTheme(): Promise<string | null> {
  try {
    const store = await getStore();
    const theme = await store.get<string>('theme');
    return theme || null;
  } catch (error) {
    console.error('Failed to get stored theme:', error);
    return null;
  }
}

export async function setStoredTheme(theme: string): Promise<void> {
  try {
    const store = await getStore();
    await store.set('theme', theme);
  } catch (error) {
    console.error('Failed to save theme:', error);
    throw error;
  }
}
