import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { ErrorBoundary } from './ErrorBoundary';
import logger from '../lib/logger';
import { terminalTheme } from '../theme/terminal';
import {
  getWebSocketService,
  resolveWebSocketUrl,
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
} from '../services/websocket';
import { useRuntimeUiState, zoomRuntimeIn, zoomRuntimeOut } from '../lib/runtime-ui-state';
import { setActivePaneSelection, setActiveTabSelection } from '../lib/runtime-selection';

interface TerminalProps {
  sessionId?: string;
  tabId: string;
  paneId: string;
  workspaceId?: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const candidate = error as { message?: unknown };
  if (typeof candidate.message === 'string' && candidate.message.length > 0) {
    return candidate.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown PTY error';
  }
}

export function Terminal({ sessionId, tabId, paneId, workspaceId, onNotification, hasNotification }: TerminalProps) {
  const [isReady, setIsReady] = useState(false);

  const fontSize = useRuntimeUiState((state) => state.fontSize);

  const currentSessionIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef(false);
  const onNotificationRef = useRef<((message: string) => void) | undefined>(onNotification);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveredTabIdsRef = useRef<Set<string>>(new Set());
  const websocketService = getWebSocketService();

  // Ghostty-web refs
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<GhosttyTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const debounceResize = useCallback((cols: number, rows: number, targetTabId: string) => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      websocketService.request('pty.resize', { tabId: targetTabId, cols, rows }).catch((error) => {
        logger.warn('Failed to resize PTY', { error, tabId: targetTabId, cols, rows });
      });
    }, 100);
  }, [websocketService]);

  const applyScrollback = useCallback((term: GhosttyTerminal, scrollback: Array<{ text?: unknown }>) => {
    if (!Array.isArray(scrollback) || scrollback.length === 0) {
      return;
    }

    const content = scrollback
      .map((line) => {
        if (typeof line?.text === 'string') {
          return line.text;
        }

        if (line?.text === undefined || line?.text === null) {
          return '';
        }

        return String(line.text);
      })
      .join('\r\n');

    if (content.length > 0) {
      term.write(`${content}\r\n`);
    }
  }, []);

  // Initialize ghostty-web terminal
  useEffect(() => {
    if (!containerRef.current) return;

    // Dispose existing terminal if fontSize changed
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    }

    const term = new GhosttyTerminal({
      fontSize,
      fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
      cursorBlink: true,
      theme: terminalTheme,
    });

    term.open(containerRef.current);

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      term.dispose();
    };
  }, [fontSize]);

  // Handle data input from terminal
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    const disposable = term.onData((data: string) => {
      if (currentSessionIdRef.current) {
        websocketService.request('pty.write', { tabId: currentSessionIdRef.current, data }).catch((error) => {
          logger.warn('Failed to write to PTY', { error, tabId: currentSessionIdRef.current });
        });
      }
    });

    return () => disposable.dispose();
  }, [websocketService]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) {
      return;
    }

    const unsubscribe = websocketService.onMessage((message: JsonRpcIncomingMessage) => {
      if (!('method' in message) || message.method !== 'pty.output') {
        return;
      }

      const notification = message as JsonRpcNotification<{
        type?: string;
        tabId?: string;
        data?: unknown;
        message?: unknown;
        code?: number | null;
      }>;
      const params = notification.params;

      if (!params || typeof params !== 'object') {
        return;
      }

      const eventTabId = typeof params.tabId === 'string' ? params.tabId : null;
      if (!eventTabId || eventTabId !== currentSessionIdRef.current) {
        return;
      }

      switch (params.type) {
        case 'output': {
          if (params.data === undefined || params.data === null) {
            return;
          }

          const output = typeof params.data === 'string' ? params.data : String(params.data);
          term.write(output);
          break;
        }
        case 'notification': {
          if (params.message === undefined || params.message === null) {
            return;
          }

          const messageText = typeof params.message === 'string' ? params.message : String(params.message);
          onNotificationRef.current?.(messageText);

          try {
            sendNotification({ title: 'Ymir', body: messageText });
          } catch (error) {
            logger.warn('Failed to send desktop notification', { error });
          }
          break;
        }
        case 'exit': {
          if (typeof params.code === 'number') {
            term.write(`\r\n[Process exited with code ${params.code}]\r\n`);
          } else {
            term.write('\r\n[Process exited]\r\n');
          }
          break;
        }
      }
    });

    return () => unsubscribe();
  }, [websocketService]);

  // Connect to PTY
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    async function connectToPty(existingSessionId: string | undefined, term: GhosttyTerminal) {
      if (isConnectingRef.current) return;

      const targetTabId = existingSessionId && existingSessionId.trim().length > 0
        ? existingSessionId
        : tabId;

      if (currentSessionIdRef.current === targetTabId) {
        setIsReady(true);
        return;
      }

      isConnectingRef.current = true;

      setIsReady(false);

      try {
        if (!websocketService.isConnected()) {
          await websocketService.connect(resolveWebSocketUrl());
        }

        await websocketService.request('pty.connect', { tabId: targetTabId });

        const tabsResult = await websocketService.request<{ tabs?: Array<{ id?: string; sessionId?: string; scrollback?: Array<{ text?: unknown }> }> }>(
          'tab.list',
          { paneId },
        ).catch((error) => {
          logger.warn('Failed to load tab scrollback', { error, paneId, tabId: targetTabId });
          return null;
        });

        const matchingTab = tabsResult?.tabs?.find((candidate) => {
          if (!candidate || typeof candidate !== 'object') {
            return false;
          }

          if (candidate.id === tabId || candidate.id === targetTabId) {
            return true;
          }

          return candidate.sessionId === targetTabId;
        });

        if (matchingTab?.scrollback?.length) {
          applyScrollback(term, matchingTab.scrollback);
        }

        currentSessionIdRef.current = targetTabId;
        setIsReady(true);
      } catch (error) {
        const errorMessage = extractErrorMessage(error);
        if (workspaceId && !recoveredTabIdsRef.current.has(targetTabId)) {
          recoveredTabIdsRef.current.add(targetTabId);
          try {
            const recoveryResult = await websocketService.request<{ tab?: { id?: string } }>('tab.create', {
              workspaceId,
              paneId,
            });
            const nextTabId = recoveryResult?.tab?.id;
            if (nextTabId) {
              setActivePaneSelection(paneId);
              setActiveTabSelection(nextTabId);
              void websocketService.request('tab.close', { id: targetTabId }).catch(() => undefined);
              return;
            }
          } catch {
            recoveredTabIdsRef.current.delete(targetTabId);
          }
        }

        logger.warn('Terminal PTY connection failed', { error: errorMessage, tabId: targetTabId });
        term.write('\r\n[Error: Failed to connect PTY]\r\n');
      } finally {
        isConnectingRef.current = false;
      }
    }

    void connectToPty(sessionId, term).catch(() => undefined);
  }, [applyScrollback, paneId, sessionId, tabId, websocketService, workspaceId]);

  // Handle resize with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    const term = terminalRef.current;
    if (!container || !fitAddon || !term) return;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        // Notify PTY of resize
        if (currentSessionIdRef.current && isReady) {
          const { cols, rows } = term;
          debounceResize(cols, rows, currentSessionIdRef.current);
        }
      } catch (_error) {
        // Silently ignore fit errors during initialization
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [isReady, debounceResize]);

  // Handle ctrl+scroll zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
        if (e.deltaY < 0) {
          zoomRuntimeIn();
        } else if (e.deltaY > 0) {
          zoomRuntimeOut();
        }
      }
    };

    const terminalElement = containerRef.current;
    terminalElement?.addEventListener('wheel', handleWheel, { passive: false });
    return () => terminalElement?.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    return () => {
      if (!resizeTimeoutRef.current) {
        return;
      }

      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = null;
    };
  }, []);

  return (
    <ErrorBoundary>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--background-hex)',
          boxShadow: hasNotification ? '0 0 0 2px var(--notification)' : 'none',
          transition: 'box-shadow 0.2s ease',
          opacity: isReady ? 1 : 0.7,
        }}
      />
    </ErrorBoundary>
  );
}
