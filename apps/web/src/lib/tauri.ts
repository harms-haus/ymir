import { invoke } from '@tauri-apps/api/core';

export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export async function revealInFileManager(path: string): Promise<void> {
  if (isTauri) {
    await invoke('reveal_in_file_manager', { path });
  } else {
    console.info(`[Web] Would reveal in file manager: ${path}`);
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  if (isTauri) {
    await invoke('copy_to_clipboard', { text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (isTauri) {
    await invoke('show_notification', { title, body });
  } else if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body });
    }
  }
}

export async function pickDirectory(): Promise<string | null> {
  if (isTauri) {
    const result = await invoke<string | null>('pick_directory');
    return result;
  }
  return null;
}