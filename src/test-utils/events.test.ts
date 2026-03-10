import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fireKeyDown,
  fireMetaKeyDown,
  fireMetaShiftKeyDown,
  fireShortcut,
} from './events';

describe('Event Utilities', () => {
  let element: HTMLElement;
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    element = document.createElement('div');
    dispatchEventSpy = vi.spyOn(element, 'dispatchEvent');
  });

  describe('fireKeyDown', () => {
    it('should fire a keydown event', () => {
      fireKeyDown(element, { key: 'a' });

      expect(dispatchEventSpy).toHaveBeenCalled();
      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.type).toBe('keydown');
      expect(event.key).toBe('a');
    });

    it('should include all modifier keys', () => {
      fireKeyDown(element, {
        key: 'a',
        code: 'KeyA',
        metaKey: true,
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
      });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('a');
      expect(event.code).toBe('KeyA');
      expect(event.metaKey).toBe(true);
      expect(event.ctrlKey).toBe(true);
      expect(event.shiftKey).toBe(true);
      expect(event.altKey).toBe(true);
    });

    it('should use defaults for missing options', () => {
      fireKeyDown(element, { key: 'b' });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('b');
      expect(event.metaKey).toBe(false);
      expect(event.ctrlKey).toBe(false);
      expect(event.shiftKey).toBe(false);
      expect(event.altKey).toBe(false);
    });

    it('should fire event on document', () => {
      const documentSpy = vi.spyOn(document, 'dispatchEvent');
      fireKeyDown(document, { key: 'c' });

      expect(documentSpy).toHaveBeenCalled();
      documentSpy.mockRestore();
    });
  });

  describe('fireMetaKeyDown', () => {
    it('should fire event with metaKey on macOS', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mac' });

      fireMetaKeyDown(element, 'd');

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('d');
      expect(event.metaKey).toBe(true);
      expect(event.ctrlKey).toBe(false);

      vi.unstubAllGlobals();
    });

    it('should fire event with ctrlKey on Windows', () => {
      vi.stubGlobal('navigator', { userAgent: 'Windows' });

      fireMetaKeyDown(element, 'd');

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('d');
      expect(event.metaKey).toBe(false);
      expect(event.ctrlKey).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should fire event with ctrlKey on Linux', () => {
      vi.stubGlobal('navigator', { userAgent: 'Linux' });

      fireMetaKeyDown(element, 'd');

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('d');
      expect(event.metaKey).toBe(false);
      expect(event.ctrlKey).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should accept additional options', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mac' });

      fireMetaKeyDown(element, 't', { shiftKey: true });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('t');
      expect(event.metaKey).toBe(true);
      expect(event.shiftKey).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe('fireMetaShiftKeyDown', () => {
    it('should fire event with metaKey and shiftKey on macOS', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mac' });

      fireMetaShiftKeyDown(element, 'w');

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('w');
      expect(event.metaKey).toBe(true);
      expect(event.shiftKey).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should fire event with ctrlKey and shiftKey on Windows', () => {
      vi.stubGlobal('navigator', { userAgent: 'Windows' });

      fireMetaShiftKeyDown(element, 'w');

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('w');
      expect(event.ctrlKey).toBe(true);
      expect(event.shiftKey).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe('fireShortcut', () => {
    it('should fire shortcut with metaKey', () => {
      vi.stubGlobal('navigator', { userAgent: 'Mac' });

      fireShortcut(element, 't', { metaKey: true });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('t');
      expect(event.metaKey).toBe(true);

      vi.unstubAllGlobals();
    });

    it('should fire shortcut with ctrlKey', () => {
      fireShortcut(element, 't', { ctrlKey: true });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('t');
      expect(event.ctrlKey).toBe(true);
    });

    it('should fire shortcut with both modifiers', () => {
      fireShortcut(element, 't', { metaKey: true, ctrlKey: true });

      const event = dispatchEventSpy.mock.calls[0][0] as KeyboardEvent;
      expect(event.key).toBe('t');
      expect(event.metaKey).toBe(true);
      expect(event.ctrlKey).toBe(true);
    });
  });
});
