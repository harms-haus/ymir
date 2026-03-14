import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDirectoryPicker, DirectoryPickerResult } from './useDirectoryPicker';
import { JSDOM } from 'jsdom';

// Setup JSDOM environment (necessary because jsdom in vitest config may not load properly)
const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as unknown as { window: Window }).window = jsdom.window as unknown as Window;
(globalThis as unknown as { document: Document }).document = jsdom.window.document;

// Mock @tauri-apps/plugin-dialog
const openMock = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}));

describe('useDirectoryPicker', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Tauri environment', () => {
    beforeEach(() => {
      // Set Tauri environment flag
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('should detect Tauri environment and set isSupported to true', () => {
      const { result } = renderHook(() => useDirectoryPicker());

      expect(result.current.isSupported).toBe(true);
      expect(result.current.isSelecting).toBe(false);
      expect(result.current.result).toBe(null);
    });

    it('should call Tauri open function when selectDirectory is called', async () => {
      const mockPath = '/home/user/projects';
      openMock.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(openMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
      });
      expect(result.current.result).toEqual({ path: mockPath });
      expect(result.current.isSelecting).toBe(false);
    });

    it('should return null and not set result when Tauri open returns null', async () => {
      openMock.mockResolvedValue(null);

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(result.current.result).toBe(null);
    });

    it('should handle string path from Tauri open correctly', async () => {
      const mockPath = '/home/user/documents';
      openMock.mockResolvedValue(mockPath);

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(selected).toEqual({ path: mockPath });
      expect(result.current.result).toEqual({ path: mockPath });
    });
  });

  describe('Web environment', () => {
    const mockShowDirectoryPicker = vi.fn();
    const mockDirectoryHandle = {
      name: 'projects',
      kind: 'directory',
    } as FileSystemDirectoryHandle;

    beforeEach(() => {
      // Set up Web environment with showDirectoryPicker
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: mockShowDirectoryPicker,
        writable: true,
        configurable: true,
      });
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    });

    it('should detect Web environment and set isSupported to true', () => {
      const { result } = renderHook(() => useDirectoryPicker());

      expect(result.current.isSupported).toBe(true);
      expect(result.current.isSelecting).toBe(false);
      expect(result.current.result).toBe(null);
    });

    it('should call showDirectoryPicker when selectDirectory is called', async () => {
      mockShowDirectoryPicker.mockResolvedValue(mockDirectoryHandle);

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(mockShowDirectoryPicker).toHaveBeenCalledTimes(1);
      expect(selected).toEqual({ name: 'projects', handle: mockDirectoryHandle });
      expect(result.current.result).toEqual({ name: 'projects', handle: mockDirectoryHandle });
    });

    it('should extract directory name from handle', async () => {
      const customHandle = {
        name: 'my-folder',
        kind: 'directory',
      } as FileSystemDirectoryHandle;
      mockShowDirectoryPicker.mockResolvedValue(customHandle);

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(selected).toEqual({ name: 'my-folder', handle: customHandle });
      expect(result.current.result).toEqual({ name: 'my-folder', handle: customHandle });
    });
  });

  describe('Unsupported browser', () => {
    beforeEach(() => {
      // Remove both Tauri and Web support
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });

    it('should set isSupported to false when no API is available', () => {
      const { result } = renderHook(() => useDirectoryPicker());

      expect(result.current.isSupported).toBe(false);
    });

    it('should return null when selectDirectory is called on unsupported browser', async () => {
      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(selected).toBe(null);
      expect(result.current.result).toBe(null);
    });
  });

  describe('Error handling', () => {
    describe('User cancellation (AbortError)', () => {
      beforeEach(() => {
        // Set up Web environment
        const mockPicker = vi.fn();
        Object.defineProperty(window, 'showDirectoryPicker', {
          value: mockPicker,
          writable: true,
          configurable: true,
        });
      });

      it('should handle AbortError silently', async () => {
        const abortError = new DOMException('User cancelled', 'AbortError');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(abortError);

        const { result } = renderHook(() => useDirectoryPicker());

        const selected = await act(async () => {
          return await result.current.selectDirectory();
        });

        expect(selected).toBe(null);
        expect(result.current.result).toBe(null);
        expect(result.current.isSelecting).toBe(false);
      });

      it('should not log error for AbortError', async () => {
        const abortError = new DOMException('User cancelled', 'AbortError');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(abortError);

        const { result } = renderHook(() => useDirectoryPicker());

        await act(async () => {
          await result.current.selectDirectory();
        });

        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });
    });

    describe('Permission denied (SecurityError)', () => {
      beforeEach(() => {
        // Set up Web environment
        const mockPicker = vi.fn();
        Object.defineProperty(window, 'showDirectoryPicker', {
          value: mockPicker,
          writable: true,
          configurable: true,
        });
      });

      it('should handle SecurityError and log warning', async () => {
        const securityError = new DOMException('Permission denied', 'SecurityError');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(securityError);

        const { result } = renderHook(() => useDirectoryPicker());

        const selected = await act(async () => {
          return await result.current.selectDirectory();
        });

        expect(selected).toBe(null);
        expect(result.current.result).toBe(null);
        expect(result.current.isSelecting).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith('Directory picker: Permission denied', securityError);
      });

      it('should not throw error for SecurityError', async () => {
        const securityError = new DOMException('Permission denied', 'SecurityError');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(securityError);

        const { result } = renderHook(() => useDirectoryPicker());

        await expect(async () => {
          await act(async () => {
            await result.current.selectDirectory();
          });
        }).not.toThrow();
      });
    });

    describe('Unexpected errors', () => {
      beforeEach(() => {
        // Set up Web environment
        const mockPicker = vi.fn();
        Object.defineProperty(window, 'showDirectoryPicker', {
          value: mockPicker,
          writable: true,
          configurable: true,
        });
      });

      it('should re-throw unexpected errors', async () => {
        const unexpectedError = new Error('Something went wrong');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(unexpectedError);

        const { result } = renderHook(() => useDirectoryPicker());

        let errorThrown: unknown = null;
        try {
          await act(async () => {
            await result.current.selectDirectory();
          });
        } catch (error) {
          errorThrown = error;
        }

        expect(errorThrown).toBeInstanceOf(Error);
        expect((errorThrown as Error).message).toBe('Something went wrong');
      });

      it('should set isSelecting to false even when error is thrown', async () => {
        const unexpectedError = new Error('Unexpected error');
        const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
        mockPicker.mockRejectedValue(unexpectedError);

        const { result } = renderHook(() => useDirectoryPicker());

        try {
          await act(async () => {
            await result.current.selectDirectory();
          });
        } catch (error) {
          // Expected to throw
        }

        expect(result.current.isSelecting).toBe(false);
      });
    });
  });

  describe('Debouncing', () => {
    beforeEach(() => {
      // Set up Web environment
      const mockPicker = vi.fn();
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: mockPicker,
        writable: true,
        configurable: true,
      });
    });

    it('should prevent concurrent calls while selecting', async () => {
      const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
      let resolvePicker: (value: FileSystemDirectoryHandle) => void;
      mockPicker.mockImplementation(() => new Promise((resolve) => {
        resolvePicker = resolve;
      }));

      const { result } = renderHook(() => useDirectoryPicker());

      // Start first selection (don't await immediately)
      const firstSelection = result.current.selectDirectory();

      // Wait for state to update
      await act(async () => {});

      // Verify isSelecting is true
      expect(result.current.isSelecting).toBe(true);

      // Try second selection while first is in progress
      const secondResult = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(secondResult).toBe(null);
      expect(mockPicker).toHaveBeenCalledTimes(1);

      // Resolve first selection
      resolvePicker!({ name: 'projects', kind: 'directory' } as FileSystemDirectoryHandle);
      const firstResult = await firstSelection;

      expect(firstResult).toEqual({ name: 'projects', handle: expect.any(Object) });
    });

    it('should allow new selection after previous one completes', async () => {
      const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
      mockPicker
        .mockResolvedValueOnce({ name: 'first', kind: 'directory' } as FileSystemDirectoryHandle)
        .mockResolvedValueOnce({ name: 'second', kind: 'directory' } as FileSystemDirectoryHandle);

      const { result } = renderHook(() => useDirectoryPicker());

      // First selection
      const firstSelected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(result.current.isSelecting).toBe(false);
      expect(firstSelected).toEqual({ name: 'first', handle: expect.any(Object) });

      // Second selection
      const secondSelected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(result.current.isSelecting).toBe(false);
      expect(secondSelected).toEqual({ name: 'second', handle: expect.any(Object) });
      expect(mockPicker).toHaveBeenCalledTimes(2);
    });

    it('should update result state on successful selection', async () => {
      const mockPicker = (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker;
      mockPicker.mockResolvedValue({ name: 'test-folder', kind: 'directory' } as FileSystemDirectoryHandle);

      const { result } = renderHook(() => useDirectoryPicker());

      await act(async () => {
        await result.current.selectDirectory();
      });

      expect(result.current.result).toEqual({ name: 'test-folder', handle: expect.any(Object) });
    });
  });

  describe('Tauri prioritization over Web', () => {
    beforeEach(() => {
      // Set up both Tauri and Web support - Tauri should take priority
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      const mockPicker = vi.fn();
      Object.defineProperty(window, 'showDirectoryPicker', {
        value: mockPicker,
        writable: true,
        configurable: true,
      });
    });

    it('should prioritize Tauri over Web when both are available', async () => {
      openMock.mockResolvedValue('/home/user/projects');

      const { result } = renderHook(() => useDirectoryPicker());

      const selected = await act(async () => {
        return await result.current.selectDirectory();
      });

      expect(selected).toEqual({ path: '/home/user/projects' });
      expect(openMock).toHaveBeenCalledTimes(1);
      expect((window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> }).showDirectoryPicker).not.toHaveBeenCalled();
    });
  });
});
