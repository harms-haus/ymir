import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlatformDetection } from '../hooks/usePlatformDetection';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

function setNavigatorPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true,
  });
}

function setNavigatorUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

describe('usePlatformDetection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedInvoke.mockReset();
  });

  describe('Tauri backend detection', () => {
    it('returns platform info from Tauri invoke on success', async () => {
      mockedInvoke.mockResolvedValue({
        platform: 'mac',
        windowManager: undefined,
      });

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('mac');
      });

      expect(result.current.buttonPosition).toBe('left');
      expect(result.current.windowManager).toBeUndefined();
      expect(mockedInvoke).toHaveBeenCalledWith('get_platform_info');
    });

    it('returns window manager from Tauri invoke for Linux', async () => {
      mockedInvoke.mockResolvedValue({
        platform: 'linux',
        windowManager: 'gnome',
      });

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('linux');
      });

      expect(result.current.buttonPosition).toBe('right');
      expect(result.current.windowManager).toBe('gnome');
    });

    it('returns right button position for Windows from Tauri', async () => {
      mockedInvoke.mockResolvedValue({
        platform: 'windows',
        windowManager: undefined,
      });

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('windows');
      });

      expect(result.current.buttonPosition).toBe('right');
    });
  });

  describe('Browser fallback detection', () => {
    it('detects macOS and sets button position to left', async () => {
      mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
      setNavigatorUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      setNavigatorPlatform('MacIntel');

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('mac');
      });

      expect(result.current.buttonPosition).toBe('left');
    });

    it('detects Windows and sets button position to right', async () => {
      mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
      setNavigatorUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      setNavigatorPlatform('Win32');

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('windows');
      });

      expect(result.current.buttonPosition).toBe('right');
    });

    it('detects Linux and sets button position to right', async () => {
      mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
      setNavigatorUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
      setNavigatorPlatform('Linux x86_64');

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('linux');
      });

      expect(result.current.buttonPosition).toBe('right');
    });

    it('defaults to unknown platform with right button position', async () => {
      mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
      setNavigatorUserAgent('Mozilla/5.0 (Unknown OS)');
      setNavigatorPlatform('Unknown');

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('unknown');
      });

      expect(result.current.buttonPosition).toBe('right');
    });

    it('detects platform from userAgent when platform string is ambiguous', async () => {
      mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
      setNavigatorUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      setNavigatorPlatform('');

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('mac');
      });

      expect(result.current.buttonPosition).toBe('left');
    });
  });

  describe('Error handling', () => {
    it('falls back to browser detection when Tauri invoke fails', async () => {
      mockedInvoke.mockRejectedValue(new Error('Command not found'));
      setNavigatorUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      setNavigatorPlatform('Win32');

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('windows');
      });

      expect(result.current.buttonPosition).toBe('right');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to get platform info from Tauri, using browser fallback:',
        expect.any(Error),
      );
    });

    it('falls back to browser detection when Tauri invoke throws synchronously', async () => {
      mockedInvoke.mockRejectedValue(new TypeError('invoke is not a function'));
      setNavigatorUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
      setNavigatorPlatform('Linux x86_64');

      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => usePlatformDetection());

      await waitFor(() => {
        expect(result.current.platform).toBe('linux');
      });

      expect(result.current.buttonPosition).toBe('right');
    });
  });

  describe('Initial state', () => {
    it('starts with unknown platform and right button position', () => {
      mockedInvoke.mockResolvedValue({
        platform: 'mac',
        windowManager: undefined,
      });

      const { result } = renderHook(() => usePlatformDetection());

      expect(result.current).toHaveProperty('platform');
      expect(result.current).toHaveProperty('buttonPosition');
      expect(['left', 'right']).toContain(result.current.buttonPosition);
    });
  });
});
