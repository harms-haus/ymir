/**
 * Terminal Component
 *
 * A ghostty-web terminal wrapper that integrates with WebSocket for PTY I/O.
 * Handles terminal initialization, resize, and data routing.
 * Uses tab-session architecture: each tab has its own stable tabId and may
 * have multiple sessions over its lifetime (respawned after TTL expiry).
 */
import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { init, Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import type {
  TerminalInput,
  TerminalResize,
  TerminalHistory,
  TerminalOutput,
  TerminalRequestHistory,
  TerminalUnmount,
  TerminalTabHistory,
} from '../../types/protocol';

// ============================================================================
// Types
// ============================================================================

export interface TerminalProps {
  /** Stable tab identifier */
  tabId: string;
  /** Current PTY session ID (may change if session respawns) */
  sessionId: string;
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
// Sanitization helpers
// ============================================================================

/**
 * Strip unterminated extended escape sequences that crash ghostty-web's parser.
 * Handles DCS, OSC, APC, PM, and SOS categories which may arrive malformed.
 */
function sanitizeTerminalData(data: string): string {
  let sanitized = data;
  // Strip unterminated extended sequences: ESC + [P]_^X + content without ESC\
  sanitized = sanitized.replace(
    /\x1b[P\]_^X](?:(?!\x1b\\)[\s\S])*?(?=\x1b[^\x1b\\]|$)/g,
    ''
  );
  // Strip orphan ST sequences
  sanitized = sanitized.replace(/\x1b\\/g, '');
  return sanitized;
}

const MAX_WRITE_SIZE = 8192;

/**
 * Safely write data to a terminal instance with sanitization and size limits.
 */
function safeWrite(terminal: { write: (data: string) => void }, data: string): void {
  if (typeof data !== 'string') {
    console.warn('[Terminal] non-string data, skipping');
    return;
  }
  const sanitized = sanitizeTerminalData(data);
  if (sanitized.length > MAX_WRITE_SIZE) {
    console.warn('[Terminal] data exceeds max write size, truncating');
    terminal.write(sanitized.slice(0, MAX_WRITE_SIZE));
  } else if (sanitized.length > 0) {
    terminal.write(sanitized);
  }
}

// ============================================================================
// Component
// ============================================================================

export const Terminal = forwardRef<TerminalRef, TerminalProps>(
  ({ tabId, sessionId, className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<GhosttyTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const client = useWebSocketClient();

    // Refs for current values — survive StrictMode remounts and sessionId changes
    const tabIdRef = useRef(tabId);
    tabIdRef.current = tabId;

    const sessionIdRef = useRef(sessionId);
    sessionIdRef.current = sessionId;

    // Buffer for messages that arrive before Ghostty terminal is ready
    const outputBufferRef = useRef<string[]>([]);

    // ========================================================================
    // Message Subscriptions (registered ONCE, survive StrictMode remounts)
    // Uses refs for sessionId/tabId/terminalRef so closures always see current values.
    // ========================================================================

    useEffect(() => {
      const unsubscribeHistory = client.onMessage('TerminalHistory', (msg: TerminalHistory) => {
        if (msg.sessionId !== sessionIdRef.current) return;
        if (terminalRef.current) {
          try {
            safeWrite(terminalRef.current, msg.data);
          } catch (e) {
            console.warn('[Terminal] write error for TerminalHistory:', e, 'data preview:', msg.data.slice(0, 100));
          }
        } else {
          outputBufferRef.current.push(sanitizeTerminalData(msg.data));
        }
      });

      const unsubscribeOutput = client.onMessage('TerminalOutput', (msg: TerminalOutput) => {
        if (msg.sessionId !== sessionIdRef.current) return;
        if (terminalRef.current) {
          try {
            safeWrite(terminalRef.current, msg.data);
          } catch (e) {
            console.warn('[Terminal] write error for TerminalOutput:', e, 'data preview:', msg.data.slice(0, 100));
          }
        } else {
          outputBufferRef.current.push(sanitizeTerminalData(msg.data));
        }
      });

      const unsubscribeTabHistory = client.onMessage('TerminalTabHistory', (msg: TerminalTabHistory) => {
        if (msg.tabId !== tabIdRef.current) return;
        if (terminalRef.current) {
          try {
            safeWrite(terminalRef.current, msg.data);
          } catch (e) {
            console.warn('[Terminal] write error for TerminalTabHistory:', e, 'data preview:', msg.data.slice(0, 100));
          }
        } else {
          outputBufferRef.current.push(sanitizeTerminalData(msg.data));
        }
      });

      // Only cleanup on true unmount, not StrictMode remount
      return () => {
        unsubscribeHistory();
        unsubscribeOutput();
        unsubscribeTabHistory();
        outputBufferRef.current = [];
      };
      // Empty deps: client is a stable singleton, refs handle sessionId/tabId changes
    }, []);

    // ========================================================================
    // Terminal Initialization
    // ========================================================================

    useEffect(() => {
      let isMounted = true;
      let resizeObserver: ResizeObserver | null = null;

      const setupTerminal = async () => {
        await initializeGhostty();

        if (!isMounted || !containerRef.current) return;

        const root = document.documentElement;
        const terminalBgRaw = getComputedStyle(root).getPropertyValue('--terminal-bg').trim();
        const terminalFgRaw = getComputedStyle(root).getPropertyValue('--terminal-fg').trim();
        const fontMono = getComputedStyle(root).getPropertyValue('--font-mono').trim();
        const terminalBg = terminalBgRaw.startsWith('hsl') ? terminalBgRaw : `hsl(${terminalBgRaw})`;
        const terminalFg = terminalFgRaw.startsWith('hsl') ? terminalFgRaw : `hsl(${terminalFgRaw})`;

        const term = new GhosttyTerminal({
          fontSize: 13,
          theme: {
            background: terminalBg || '#0d1117',
            foreground: terminalFg || '#e6edf3',
          },
          fontFamily: fontMono || 'ui-monospace, SFMono-Regular, monospace',
        });

        term.open(containerRef.current);
        terminalRef.current = term;

        // Flush any buffered output that arrived during Ghostty init
        const buffer = outputBufferRef.current;
        outputBufferRef.current = [];
        for (const data of buffer) {
          try {
            safeWrite(term, data);
          } catch (e) {
            console.warn('[Terminal] write error flushing buffer:', e, 'data preview:', data.slice(0, 100));
          }
        }

        term.onData((data: string) => {
          const message: TerminalInput = {
            type: 'TerminalInput',
            sessionId: sessionIdRef.current,
            data,
          };
          client.send(message);
        });

        term.onResize((size: { cols: number; rows: number }) => {
          const resizeMessage: TerminalResize = {
            type: 'TerminalResize',
            sessionId: sessionIdRef.current,
            cols: size.cols,
            rows: size.rows,
          };
          client.send(resizeMessage);
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;
        fitAddon.fit();

        if (containerRef.current && 'ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(() => {
            if (fitAddonRef.current && terminalRef.current) {
              fitAddonRef.current.fit();
            }
          });
          resizeObserver.observe(containerRef.current);
        }

        // Request terminal history AFTER terminal is ready
        const requestId = generateId();
        const historyRequest: TerminalRequestHistory = {
          type: 'TerminalRequestHistory',
          tabId: tabIdRef.current,
          sessionId: sessionIdRef.current,
          requestId,
          limit: 1000,
        };
        client.send(historyRequest);
      };

      setupTerminal();

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

        outputBufferRef.current = [];
      };
    }, [sessionId, client]);

    // ========================================================================
    // Unmount: notify server
    // ========================================================================

    useEffect(() => {
      return () => {
        // Send TerminalUnmount when the component is truly unmounting
        const unmountMsg: TerminalUnmount = {
          type: 'TerminalUnmount',
          tabId: tabIdRef.current,
          sessionId: sessionIdRef.current,
        };
        client.send(unmountMsg);
      };
      // Empty deps — only run on true unmount
    }, []);

    // ========================================================================
    // Exposed Methods
    // ========================================================================

    const write = useCallback((data: string) => {
      if (terminalRef.current) {
        safeWrite(terminalRef.current, data);
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

    // ========================================================================
    // Render
    // ========================================================================

    return (
      <div
        ref={containerRef}
        className={`terminal-container ${className}`}
        data-testid="terminal"
        data-tab-id={tabId}
        data-session-id={sessionId}
      />
    );
  }
);

Terminal.displayName = 'Terminal';

export default Terminal;
