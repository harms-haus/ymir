/**
 * usePlatformDetection hook - Platform and window manager detection
 *
 * Provides platform information for custom titlebar implementation.
 * Detects operating system and window manager to determine button position.
 * Uses Rust backend via Tauri when available, falls back to browser detection.
 *
 * @example
 * ```tsx
 * const { platform, windowManager, buttonPosition } = usePlatformDetection();
 *
 * // WindowControls will use buttonPosition to place buttons on left/right
 * <WindowControls position={buttonPosition} />
 * ```
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Platform info return type
 */
export interface PlatformInfo {
  /** Operating platform: 'mac', 'windows', 'linux' */
  platform: string;
  /** Window manager (Linux only): 'gnome', 'kde', etc. */
  windowManager?: string;
  /** Button position: 'left' (macOS) or 'right' (Windows/Linux) */
  buttonPosition: 'left' | 'right';
}

/**
 * Hook for detecting platform and window manager
 *
 * Detection priority:
 * 1. Tauri backend: get_platform_info() (most accurate)
 * 2. Browser fallback: navigator.platform (less reliable on Linux)
 *
 * Button position logic:
 * - macOS: left side (traffic lights)
 * - Windows: right side
 * - Linux: right side (default, assumes GNOME/KDE)
 *
 * @returns Platform information including button position
 */
export function usePlatformDetection(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    platform: 'unknown',
    buttonPosition: 'right',
  });

  useEffect(() => {
    let isMounted = true;

    /**
     * Detect platform using browser APIs (fallback)
     */
    function detectPlatformBrowser(): PlatformInfo {
      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform.toLowerCase();

      let detectedPlatform: string = 'unknown';
      let buttonPos: 'left' | 'right' = 'right';

      if (userAgent.includes('mac') || platform.includes('mac')) {
        detectedPlatform = 'mac';
        buttonPos = 'left';
      } else if (userAgent.includes('win') || platform.includes('win')) {
        detectedPlatform = 'windows';
        buttonPos = 'right';
      } else if (userAgent.includes('linux') || platform.includes('linux')) {
        detectedPlatform = 'linux';
        buttonPos = 'right';
      }

      return {
        platform: detectedPlatform,
        buttonPosition: buttonPos,
      };
    }

    /**
     * Fetch platform info from Tauri backend
     */
    async function fetchPlatformInfo() {
      try {
        const result = await invoke<{ platform: string; windowManager: string }>(
          'get_platform_info'
        );

        if (!isMounted) return;

        const buttonPos = result.platform === 'mac' ? 'left' : 'right';

        setPlatformInfo({
          platform: result.platform,
          windowManager: result.windowManager,
          buttonPosition: buttonPos,
        });
      } catch (error) {
        // Fallback to browser detection if Tauri is unavailable
        console.warn('Failed to get platform info from Tauri, using browser fallback:', error);
        if (!isMounted) return;

        const fallback = detectPlatformBrowser();
        setPlatformInfo(fallback);
      }
    }

    // Try Tauri backend first, fall back to browser detection
    fetchPlatformInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return platformInfo;
}

export default usePlatformDetection;
