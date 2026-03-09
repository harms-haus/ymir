import { ReactElement } from 'react';
import { render, RenderOptions, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

/**
 * Re-export everything from @testing-library/react
 */
export {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
  act,
  queryByTestId,
  queryAllByTestId,
  getByTestId,
  getAllByTestId,
  cleanup,
} from '@testing-library/react';

export { userEvent };

/**
 * Custom render options for renderWithStore
 */
interface CustomRenderOptions extends RenderOptions {
  initialState?: Record<string, unknown>;
  initialWorkspaces?: unknown[];
}

/**
 * Custom render function that wraps components with Zustand store
 * This allows testing components that depend on global store state
 *
 * Note: We mock the store at the test level rather than importing the real one.
 * For actual component tests, you mock the @tauri-apps/plugin-store and setup.ts instead.
 */
export function renderWithStore(
  ui: ReactElement,
  options: CustomRenderOptions = {}
): ReturnType<typeof render> & { store: unknown } {
  const { initialState, initialWorkspaces, ...renderOptions } = options;

  const state = initialState ?? {};

  const mockStore = {
    get: vi.fn().mockImplementation(async (key: string) => {
      return Promise.resolve(state[key] ?? null);
    }),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      state[key] = value;
      return Promise.resolve();
    }),
    save: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockImplementation(async (key: string) => {
      return Promise.resolve(key in state);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      delete state[key];
      return Promise.resolve();
    }),
    clear: vi.fn().mockImplementation(async () => {
      Object.keys(state).forEach(key => delete state[key]);
      return Promise.resolve();
    }),
    entries: vi.fn().mockResolvedValue(Object.entries(state)),
    keys: vi.fn().mockResolvedValue(Object.keys(state)),
    values: vi.fn().mockResolvedValue(Object.values(state)),
    length: vi.fn().mockResolvedValue(Object.keys(state).length),
    reload: vi.fn().mockResolvedValue(undefined),
  };

  vi.mock('@tauri-apps/plugin-store', () => ({
    Store: vi.fn().mockImplementation(() => mockStore),
    load: vi.fn().mockResolvedValue(mockStore),
  }));

  const rendered = render(ui, renderOptions);

  return {
    ...rendered,
    store: mockStore,
  };
}

/**
 * Helper to wait for store updates
 */
export async function waitForStoreUpdate(
  callback: () => void,
  timeout: number = 1000
): Promise<void> {
  return waitFor(callback, { timeout });
}
