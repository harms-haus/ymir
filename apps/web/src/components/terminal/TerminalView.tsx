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
import { init, Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
import { getWebSocketClient } from '../../lib/ws';
import type { TerminalInput, TerminalResize } from '../../types/generated/protocol';

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
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsClientRef = useRef(getWebSocketClient());

    // ============================================================================
    // Terminal Initialization
    // ============================================================================

  useEffect(() => {
    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const setupTerminal = async () => {
      // Initialize ghostty-web WASM (singleton)
      await initializeGhostty();

      if (!isMounted || !containerRef.current) return;

      // Get theme colors from CSS variables (wrap HSL values)
      const root = document.documentElement;
      const terminalBgRaw = getComputedStyle(root).getPropertyValue('--terminal-bg').trim();
      const terminalFgRaw = getComputedStyle(root).getPropertyValue('--terminal-fg').trim();
      const fontMono = getComputedStyle(root).getPropertyValue('--font-mono').trim();
      // Wrap HSL values in hsl() for proper color parsing
      const terminalBg = terminalBgRaw.startsWith('hsl') ? terminalBgRaw : `hsl(${terminalBgRaw})`;
      const terminalFg = terminalFgRaw.startsWith('hsl') ? terminalFgRaw : `hsl(${terminalFgRaw})`;

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

      // Set up resize handler to sync with backend
      term.onResize((size: { cols: number; rows: number }) => {
        const resizeMessage: TerminalResize = {
          type: 'TerminalResize',
          sessionId: terminalSessionId,
          cols: size.cols,
          rows: size.rows,
        };
        wsClientRef.current.send(resizeMessage);
      });

      // Load FitAddon for automatic resize handling
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitAddonRef.current = fitAddon;

      // Initial fit
      fitAddon.fit();

      // Set up ResizeObserver to detect container size changes
      if (containerRef.current && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
          if (fitAddonRef.current && terminalRef.current) {
            fitAddonRef.current.fit();
          }
        });
        resizeObserver.observe(containerRef.current);
      }
    };

    setupTerminal();

    // Cleanup
    return () => {
      isMounted = false;

      if (resizeObserver && containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
        resizeObserver.disconnect();
      }

      if (fitAddonRef.current) {
        fitAddonRef.current.dispose();
        fitAddonRef.current = null;
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
      data-testid="terminal"
      data-session-id={terminalSessionId}
    />
  );
}
);

Terminal.displayName = 'Terminal';

export default Terminal;
