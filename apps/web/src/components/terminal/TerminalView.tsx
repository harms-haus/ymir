/**
 * Terminal Component
 *
 * A ghostty-web terminal wrapper that integrates with WebSocket for PTY I/O.
 * Handles terminal initialization, resize, and data routing.
 */
import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { init, Terminal as GhosttyTerminal } from 'ghostty-web';
import { getWebSocketClient } from '../../lib/ws';
import type { TerminalInput, TerminalResize } from '../../types/protocol';

// ============================================================================
// Types
// ============================================================================

export interface TerminalProps {
  /** Terminal session ID from backend PTY */
  terminalSessionId: string;
  /** Optional className for styling */
  className?: string;
}

export interface TerminalRef {
  /** Write data to the terminal (from WebSocket TerminalOutput) */
  write: (data: string) => void;
  /** Resize the terminal */
  resize: (cols: number, rows: number) => void;
}

// ============================================================================
// Module-level singleton for ghostty-web initialization
// ============================================================================

let initPromise: Promise<void> | null = null;

/**
 * Initialize ghostty-web WASM module (singleton - only runs once)
 */
export function initializeGhostty(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

/**
 * Check if ghostty-web has been initialized
 */
export function isGhosttyInitialized(): boolean {
  return initPromise !== null;
}

// ============================================================================
// Component
// ============================================================================

export const Terminal = forwardRef<TerminalRef, TerminalProps>(
  ({ terminalSessionId, className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<GhosttyTerminal | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const wsClientRef = useRef(getWebSocketClient());

    // ============================================================================
    // Terminal Initialization
    // ============================================================================

    useEffect(() => {
      let isMounted = true;

      const setupTerminal = async () => {
        // Initialize ghostty-web WASM (singleton)
        await initializeGhostty();

        if (!isMounted || !containerRef.current) return;

        // Get theme colors from CSS variables
        const root = document.documentElement;
        const terminalBg = getComputedStyle(root).getPropertyValue('--terminal-bg').trim();
        const terminalFg = getComputedStyle(root).getPropertyValue('--terminal-fg').trim();
        const fontMono = getComputedStyle(root).getPropertyValue('--font-mono').trim();

        // Create terminal instance
        const term = new GhosttyTerminal({
          fontSize: 13,
          theme: {
            background: terminalBg || '#0d1117',
            foreground: terminalFg || '#e6edf3',
          },
          fontFamily: fontMono || 'ui-monospace, SFMono-Regular, monospace',
        });

        // Open terminal in container
        term.open(containerRef.current);
        terminalRef.current = term;

        // Set up data handler - send input to WebSocket
        term.onData((data: string) => {
          const message: TerminalInput = {
            type: 'TerminalInput',
            sessionId: terminalSessionId,
            data,
          };
          wsClientRef.current.send(message);
        });

        // Set up resize observer
        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry || !terminalRef.current) return;

          // Calculate terminal dimensions based on container size
          const { width, height } = entry.contentRect;

          // Get font metrics to calculate cols/rows
          const canvas = containerRef.current?.querySelector('canvas');
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

  // Measure character size
            ctx.font = `${term.options.fontSize}px ${term.options.fontFamily}`;
            const charWidth = ctx.measureText('M').width;
            const charHeight = term.options.fontSize * 1.2; // Approximate line height

            // Guard against zero or negative dimensions
            if (width <= 0 || height <= 0 || charWidth <= 0 || charHeight <= 0) {
              return;
            }

            // Calculate cols and rows with minimum of 1
            const cols = Math.max(1, Math.floor(width / charWidth));
            const rows = Math.max(1, Math.floor(height / charHeight));

            // Resize terminal
            term.resize(cols, rows);

          // Send resize message to backend
          const resizeMessage: TerminalResize = {
            type: 'TerminalResize',
            sessionId: terminalSessionId,
            cols,
            rows,
          };
          wsClientRef.current.send(resizeMessage);
        });

        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;
      };

      setupTerminal();

      // Cleanup
      return () => {
        isMounted = false;

        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
        }

        if (terminalRef.current) {
          terminalRef.current.dispose();
          terminalRef.current = null;
        }
      };
    }, [terminalSessionId]);

    // ============================================================================
    // Exposed Methods
    // ============================================================================

    const write = useCallback((data: string) => {
      if (terminalRef.current) {
        terminalRef.current.write(data);
      }
    }, []);

    const resize = useCallback((cols: number, rows: number) => {
      if (terminalRef.current) {
        terminalRef.current.resize(cols, rows);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      write,
      resize,
    }));

    // ============================================================================
    // Render
    // ============================================================================

  return (
    <div
      ref={containerRef}
      className={`terminal-container ${className}`}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--terminal-bg)',
      }}
      data-testid="terminal"
      data-session-id={terminalSessionId}
    />
  );
  }
);

Terminal.displayName = 'Terminal';

export default Terminal;
