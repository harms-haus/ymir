import { vi } from 'vitest';

/**
 * Create a mock Tauri invoke function
 */
export function mockInvoke<T = unknown>(returnValue?: T) {
  return vi.fn().mockResolvedValue(returnValue);
}

/**
 * Create a mock Tauri Channel class
 */
export function mockChannel() {
  return vi.fn().mockImplementation(() => ({
    onmessage: null,
    post: vi.fn().mockResolvedValue(undefined),
    id: `mock-channel-${Date.now()}`,
  }));
}

/**
 * Setup function to mock all Tauri APIs
 */
export function setupTauriMocks() {
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: mockInvoke(),
    Channel: mockChannel(),
  }));

  vi.mock('@tauri-apps/plugin-notification', () => ({
    sendNotification: vi.fn(),
  }));

  vi.mock('@tauri-apps/plugin-shell', () => ({
    Command: vi.fn(),
  }));
}
