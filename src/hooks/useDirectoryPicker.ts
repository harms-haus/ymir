/**
 * useDirectoryPicker hook - Cross-platform folder selection
 *
 * Provides directory selection functionality for both Tauri (desktop) and Web environments.
 * - Tauri: Uses @tauri-apps/plugin-dialog with full path support
 * - Web: Uses File System Access API (Chrome/Edge 86+) with folder name only
 * - Other browsers (Firefox/Safari): Not supported (isSupported = false)
 *
 * @example
 * ```tsx
 * const { selectDirectory, isSupported, isSelecting, result } = useDirectoryPicker();
 *
 * // Check if directory picker is supported in current browser
 * if (!isSupported) {
 *   return <div>Directory picker not supported in this browser</div>;
 * }
 *
 * // Use the result
 * return (
 *   <button onClick={selectDirectory} disabled={isSelecting}>
 *     {isSelecting ? 'Selecting...' : 'Select Directory'}
 *   </button>
 *   {result && <div>Selected: {result.path || result.name}</div>}
 * );
 * ```
 */

import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

/**
 * Result from directory picker operation
 */
export interface DirectoryPickerResult {
  /** Full file path (Tauri only) */
  path?: string;
  /** Folder name (Web only) */
  name?: string;
  /** Directory handle for File System Access API (Web only) */
  handle?: FileSystemDirectoryHandle;
}

/**
 * Hook return interface
 */
export interface UseDirectoryPickerReturn {
  /** Trigger directory selection dialog */
  selectDirectory: () => Promise<DirectoryPickerResult | null>;
  /** Whether directory picker is supported in current environment */
  isSupported: boolean;
  /** Whether directory selection is in progress */
  isSelecting: boolean;
  /** Last selected directory result */
  result: DirectoryPickerResult | null;
}

/**
 * Hook for cross-platform directory selection
 *
 * Detection priority:
 * 1. Tauri desktop: Always supported, uses native file dialog
 * 2. Web browsers: Check for showDirectoryPicker API support
 *
 * Result differences:
 * - Tauri: Returns full system path (e.g., '/home/user/projects')
 * - Web: Returns folder name only (e.g., 'projects') due to security restrictions
 *
 * @returns Directory picker interface with state and selection function
 */
export function useDirectoryPicker(): UseDirectoryPickerReturn {
  const [isSelecting, setIsSelecting] = useState(false);
  const [result, setResult] = useState<DirectoryPickerResult | null>(null);

  // Detect if running in Tauri environment
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  // Type guard for showDirectoryPicker API
  function hasShowDirectoryPicker(win: Window): win is Window & { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> } {
    return 'showDirectoryPicker' in win;
  }

  // Detect if browser supports showDirectoryPicker (Chrome/Edge 86+)
  const isWebSupported = typeof window !== 'undefined' && hasShowDirectoryPicker(window);

  // Directory picker is supported if running in Tauri OR web has the API
  const isSupported = isTauri || isWebSupported;

  /**
   * Open directory picker dialog
   *
   * Handles both Tauri and Web environments:
   * - Tauri: Uses native system dialog with full path
   * - Web: Uses File System Access API with folder name
   *
   * @returns Directory result or null if cancelled/unsupported
   */
  const selectDirectory = useCallback(async (): Promise<DirectoryPickerResult | null> => {
    // Guard against unsupported browsers
    if (!isSupported) {
      return null;
    }

    // Debounce: prevent rapid clicks while selecting
    if (isSelecting) {
      return null;
    }

    setIsSelecting(true);

    try {
      let selected: DirectoryPickerResult | null = null;

      if (isTauri) {
        // Tauri: Use native file dialog (returns full path)
        const selectedPath = await open({
          directory: true,
          multiple: false,
        });

        if (selectedPath && typeof selectedPath === 'string') {
          selected = {
            path: selectedPath,
          };
        }
      } else if (isWebSupported) {
        // Web: Use File System Access API (returns folder name only)
        const handle = await (window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();

        selected = {
          name: handle.name,
          handle: handle,
        };
      }

      setResult(selected);
      return selected;
    } catch (error) {
      // Handle user cancellation (AbortError) - silent, no error needed
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }

      // Handle permission denied (SecurityError) - log warning but don't throw
      if (error instanceof DOMException && error.name === 'SecurityError') {
        console.warn('Directory picker: Permission denied', error);
        return null;
      }

      // Re-throw unexpected errors
      throw error;
    } finally {
      setIsSelecting(false);
    }
  }, [isSupported, isTauri, isWebSupported, isSelecting]);

  return {
    selectDirectory,
    isSupported,
    isSelecting,
    result,
  };
}

export default useDirectoryPicker;
