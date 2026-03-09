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
 * Create a mock Tauri Store instance
 */
export function mockTauriStore() {
  const store: Record<string, unknown> = {};
  
  return vi.fn().mockImplementation(() => ({
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(key in store ? store[key] : null);
    }),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }),
    save: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(key in store);
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: vi.fn().mockImplementation(() => {
      Object.keys(store).forEach(key => delete store[key]);
      return Promise.resolve();
    }),
    entries: vi.fn().mockResolvedValue(Object.entries(store)),
    keys: vi.fn().mockResolvedValue(Object.keys(store)),
    values: vi.fn().mockResolvedValue(Object.values(store)),
    length: vi.fn().mockResolvedValue(Object.keys(store).length),
    reload: vi.fn().mockResolvedValue(undefined),
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

  vi.mock('@tauri-apps/plugin-store', () => ({
    Store: mockTauriStore(),
    load: vi.fn().mockResolvedValue({}),
  }));

  vi.mock('@tauri-apps/plugin-notification', () => ({
    sendNotification: vi.fn(),
  }));

  vi.mock('@tauri-apps/plugin-shell', () => ({
    Command: vi.fn(),
  }));
}
