/**
 * Keyboard event simulation utilities for testing
 */

export interface KeyboardEventOptions {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const defaults: Partial<KeyboardEventOptions> = {
  key: '',
  code: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

/**
 * Fire a keyboard event on an element
 */
export function fireKeyDown(
  element: Element | Document,
  options: KeyboardEventOptions
): void {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: options.key ?? '',
    code: options.code ?? '',
    metaKey: options.metaKey ?? defaults.metaKey,
    ctrlKey: options.ctrlKey ?? defaults.ctrlKey,
    shiftKey: options.shiftKey ?? defaults.shiftKey,
    altKey: options.altKey ?? defaults.altKey,
  });

  element.dispatchEvent(event);
}

/**
 * Fire a keyboard event with Cmd (macOS) / Ctrl (Windows/Linux) modifier
 */
export function fireMetaKeyDown(
  element: Element | Document,
  key: string,
  options?: Partial<KeyboardEventOptions>
): void {
  const isMac = /mac|iphone/.test(navigator.userAgent.toLowerCase());
  const useMeta = isMac;

  fireKeyDown(element, {
    key,
    metaKey: useMeta,
    ctrlKey: !useMeta,
    ...options,
  });
}

/**
 * Fire a keyboard shortcut with Cmd+Shift on macOS) / Ctrl+Shift (Windows/Linux)
 */
export function fireMetaShiftKeyDown(
  element: Element | Document,
  key: string
): void {
  fireMetaKeyDown(element, key, { shiftKey: true });
}

/**
 * Create common keyboard shortcuts for testing
 * Usage: fireShortcut(element, { key: 'd', metaKey: true })
 */
export function fireShortcut(
  element: Element | Document,
  key: string,
  options: Pick<KeyboardEventOptions, 'metaKey' | 'ctrlKey'>
): void {
  fireMetaKeyDown(element, key, {
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
  });
}
