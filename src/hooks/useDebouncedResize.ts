import { useCallback, useRef, useEffect } from 'react';

/**
 * Size object for resize operations
 * @property cols - Number of columns
 * @property rows - Number of rows
 */
export interface ResizeSize {
  cols: number;
  rows: number;
}

/**
 * Hook that returns a debounced callback for resize operations.
 * Prevents resize storms by delaying the callback invocation.
 *
 * @param callback - Function to call after debounce delay
 * @param delay - Debounce delay in milliseconds (default: 100ms)
 * @returns Debounced callback function
 *
 * @example
 * ```typescript
 * const debouncedResize = useDebouncedResize((size) => {
 *   resizePty(paneId, size.cols, size.rows);
 * }, 100);
 *
 * // Call multiple times rapidly - only last call executes after 100ms
 * debouncedResize({ cols: 80, rows: 24 });
 * debouncedResize({ cols: 80, rows: 25 });
 * debouncedResize({ cols: 80, rows: 26 }); // Only this executes after delay
 * ```
 */
export function useDebouncedResize(
  callback: (size: ResizeSize) => void,
  delay = 100
): (size: ResizeSize) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (size: ResizeSize) => {
      // Clear existing timeout to reset the debounce timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback(size);
      }, delay);
    },
    [callback, delay]
  );

  return debouncedCallback;
}
