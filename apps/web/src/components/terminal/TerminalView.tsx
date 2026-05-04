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

// crypto.randomUUID may not be available in non-secure contexts (HTTP)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
 *
 * These sequences can be terminated by either:
 *   - ST (String Terminator): \x1b\\  (ESC \)
 *   - BEL (Bell): \x07
 */
function sanitizeTerminalData(data: string): string {
  let sanitized = data;
  // Strip extended sequences (DCS, OSC, APC, PM, SOS) that may be malformed.
  // These sequences start with ESC + [P]_^X] and are terminated by either
  // ST (\x1b\\) or BEL (\x07). If unterminated, strip only up to the next
  // escape sequence to avoid consuming valid prompt text.
  sanitized = sanitized.replace(
    /\x1b[P\]_^X](?:(?!\x1b\\|\x07)[\s\S])*?(?:(?:\x1b\\|\x07)|(?=\x1b[^\x1b\\]|$))/g,
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

    // Deduplicate history requests across StrictMode remounts
    const historyRequestedRef = useRef<Set<string>>(new Set());

    // Track WASM initialization failure for error UI
    const initErrorRef = useRef<string | null>(null);

    // ========================================================================
    // Message Subscriptions (registered ONCE, survive StrictMode remounts)
    // Uses refs for sessionId/tabId/terminalRef so closures always see current values.
    // ========================================================================

    useEffect(() => {
      const unsubscribeHistory = client.onMessage('TerminalHistory', (msg: TerminalHistory) => {
        console.log('[Terminal] onMessage TerminalHistory:', 'sessionId match:', msg.sessionId === sessionIdRef.current, 'data len:', msg.data.length, 'terminal ready:', !!terminalRef.current);
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
        console.log('[Terminal] onMessage TerminalOutput:', 'sessionId match:', msg.sessionId === sessionIdRef.current, 'data len:', msg.data.length, 'terminal ready:', !!terminalRef.current);
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
        console.log('[Terminal] onMessage TerminalTabHistory:', 'tabId match:', msg.tabId === tabIdRef.current, 'data len:', msg.data.length, 'terminal ready:', !!terminalRef.current);
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
        console.log('[Terminal] setupTerminal starting for sessionId:', sessionIdRef.current?.slice(0, 8) ?? 'null', 'tabId:', tabIdRef.current?.slice(0, 8) ?? 'null');
        try {
          await initializeGhostty();
          console.log('[Terminal] ghostty-web init succeeded');
        } catch (e) {
          console.error('[Terminal] ghostty-web WASM initialization failed:', e);
          initErrorRef.current = e instanceof Error ? e.message : String(e);
          return;
        }

        if (!isMounted || !containerRef.current) return;

        const root = document.documentElement;
        const terminalBgRaw = getComputedStyle(root).getPropertyValue('--terminal-bg').trim();
        const terminalFgRaw = getComputedStyle(root).getPropertyValue('--terminal-fg').trim();
        const fontMono = getComputedStyle(root).getPropertyValue('--font-mono').trim();
        const terminalBg = terminalBgRaw && terminalBgRaw.startsWith('hsl') ? terminalBgRaw : terminalBgRaw ? `hsl(${terminalBgRaw})` : '#0d1117';
        const terminalFg = terminalFgRaw && terminalFgRaw.startsWith('hsl') ? terminalFgRaw : terminalFgRaw ? `hsl(${terminalFgRaw})` : '#e6edf3';

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
        console.log('[Terminal] terminal opened, ref set, container has', containerRef.current.children.length, 'children');

        // Flush any buffered output that arrived during Ghostty init
        const buffer = outputBufferRef.current;
        outputBufferRef.current = [];
        console.log('[Terminal] flushing output buffer:', buffer.length, 'items');
        for (const data of buffer) {
          try {
            safeWrite(term, data);
          } catch (e) {
            console.warn('[Terminal] write error flushing buffer:', e, 'data preview:', data.slice(0, 100));
          }
        }

        term.onData((data: string) => {
          console.log('[Terminal] onData (user typed):', data.length, 'chars, sessionId:', sessionIdRef.current?.slice(0, 8) ?? 'null');
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
        // Defer fit() to the next frame so CSS layout is fully computed.
        // Calling fit() immediately after term.open() can measure 0x0
        // if the browser hasn't finished layout yet.
        requestAnimationFrame(() => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
          }
        });

        if (containerRef.current && 'ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(() => {
            if (fitAddonRef.current && terminalRef.current) {
              fitAddonRef.current.fit();
            }
          });
          resizeObserver.observe(containerRef.current);
        }

        // Request terminal history AFTER terminal is ready
        const key = `${tabIdRef.current}:${sessionIdRef.current}`;
        console.log('[Terminal] history request check:', key.slice(0, 16), 'already sent:', historyRequestedRef.current.has(key), 'terminal ready:', !!terminalRef.current);
        if (!historyRequestedRef.current.has(key)) {
          historyRequestedRef.current.add(key);
          const requestId = generateId();
          console.log('[Terminal] sending TerminalRequestHistory:', key.slice(0, 16), 'requestId:', requestId.slice(0, 8));
          const historyRequest: TerminalRequestHistory = {
            type: 'TerminalRequestHistory',
            tabId: tabIdRef.current,
            sessionId: sessionIdRef.current,
            requestId,
            limit: 1000,
          };
          client.send(historyRequest);
        }
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

        // Remove history key so StrictMode remount re-requests history.
        // Without this, the dedup Set survives StrictMode's synthetic unmount,
        // causing the second mount to skip the history request.
        const key = `${tabIdRef.current}:${sessionIdRef.current}`;
        historyRequestedRef.current.delete(key);
      };
    }, [client]);

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

    if (initErrorRef.current) {
      return (
        <div
          className={`terminal-container terminal-error ${className}`}
          data-testid="terminal-error"
          data-tab-id={tabId}
          data-session-id={sessionId}
        >
          <div className="terminal-error-content">
            <h3>Terminal Initialization Failed</h3>
            <p>{initErrorRef.current}</p>
            <p className="terminal-error-hint">
              The terminal emulator failed to load. This may be caused by an
              incompatible browser or a network issue loading the WASM module.
            </p>
          </div>
        </div>
      );
    }

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
