import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { ErrorBoundary } from './ErrorBoundary';
import { TerminalLoading } from './TerminalLoading';
import logger from '../lib/logger';
import { terminalTheme } from '../theme/terminal';
import {
  getWebSocketService,
  resolveWebSocketUrl,
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
} from '../services/websocket';
import { useRuntimeUiState, zoomRuntimeIn, zoomRuntimeOut } from '../lib/runtime-ui-state';

interface TerminalProps {
  sessionId?: string;
  tabId: string;
  paneId: string;
  workspaceId?: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

const MAX_CONNECT_ATTEMPTS = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;
const DEBUG_TERMIN = true;

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

export function Terminal({ sessionId, tabId, paneId, workspaceId: _workspaceId, onNotification, hasNotification }: TerminalProps) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [connectionErrors, setConnectionErrors] = useState<string[]>([]);

  const fontSize = useRuntimeUiState((state) => state.fontSize);

  const currentSessionIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef(false);
  const cancelledRef = useRef(false);
  const onNotificationRef = useRef<((message: string) => void) | undefined>(onNotification);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const websocketService = getWebSocketService();

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
      if (DEBUG_TERMIN) {
        logger.info('[TERMINAL] applyScrollback: no scrollback to apply');
      }
      return;
    }

    if (DEBUG_TERMIN) {
      logger.info(`[TERMINAL] applyScrollback: applying ${scrollback.length} lines`);
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
      if (DEBUG_TERMIN) {
        logger.info(`[TERMINAL] applyScrollback: writing ${content.length} characters to terminal`);
      }
      term.write(`${content}\r\n`);
    }
  }, []);

  // Initialize ghostty-web terminal when connection is established
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    // Small delay to ensure container is fully rendered
    const initTimer = setTimeout(() => {
      if (!containerRef.current) return;

      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
 }

      // CREATE TERMINAL
      const term = new GhosttyTerminal({
        fontSize,
        fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
        cursorBlink: true,
        theme: terminalTheme,
      });

      // OPEN
      term.open(containerRef.current);

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitAddon.fit();

      // ATTACH INPUT HANDDER
      if (DEBUG_TERMIN) {
        logger.info('[TERMINAL] Registering onData handler');
      }
      const disposable = term.onData((data: string) => {
        if (DEBUG_TERMIN) {
          logger.info('[TERMINAL →] onData triggered', {
            dataPreview: data.substring(0, 20),
            dataLength: data.length,
          });
        }
        if (currentSessionIdRef.current) {
          if (DEBUG_TERMIN) {
            logger.info('[TERMINAL →] Sending pty.write request', {
              tabId: currentSessionIdRef.current,
              dataPreview: data.substring(0, 20),
              dataLength: data.length,
            });
          }
          websocketService.request('pty.write', { tabId: currentSessionIdRef.current, data }).catch((error) => {
            logger.warn('Failed to write to PTY', { error, tabId: currentSessionIdRef.current });
          });
        } else {
          if (DEBUG_TERMIN) {
            logger.warn('[TERMINAL →] Cannot send PTY data: no current session ID', {
              dataPreview: data.substring(0, 20),
              dataLength: data.length,
            });
          }
        }
      });

      // FOCUS so keystrokes are captured
      term.focus();

      // STORE REFS
      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      // STORE DISPOSABLE for cleanup
      const handlerCleanup = () => {
        if (DEBUG_TERMIN) {
          logger.info('[TERMINAL] Cleaning up onData handler');
        }
        disposable.dispose();
      };
      return handlerCleanup;
    }, 50);

    return () => {
      clearTimeout(initTimer);
      if (terminalRef.current) {
        if (DEBUG_TERMIN) {
          logger.info('[TERMINAL] Disposing terminal');
        }
        terminalRef.current.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [connectionStatus, fontSize, websocketService]);

  useEffect(() => {
    if (DEBUG_TERMIN) {
      logger.info('[TERMINAL] Setting up PTY output message listener', {
        terminalReady: !!terminalRef.current,
        connectionStatus,
      });
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
        if (DEBUG_TERMIN) {
          logger.warn('[TERMINAL ←] pty.output notification has no params');
        }
        return;
      }

      const eventTabId = typeof params.tabId === 'string' ? params.tabId : null;

      if (DEBUG_TERMIN) {
        logger.info('[TERMINAL ←] Received pty.output notification', {
          eventTabId,
          currentSessionId: currentSessionIdRef.current,
          type: params.type,
          dataLength: typeof params.data === 'string' ? params.data.length : 'non-string',
          terminalReady: !!terminalRef.current,
          rawParams: JSON.stringify(params),
        });
      }

      if (!eventTabId || eventTabId !== currentSessionIdRef.current) {
        if (DEBUG_TERMIN) {
          logger.warn('[TERMINAL ←] Ignoring pty.output - tab ID mismatch', {
            eventTabId,
            currentSessionId: currentSessionIdRef.current,
          });
        }
        return;
      }

      const term = terminalRef.current;
      if (!term) {
        if (DEBUG_TERMIN) {
          logger.warn('[TERMINAL ←] Cannot write - terminal not ready', { eventTabId });
        }
        return;
      }

      switch (params.type) {
        case 'output': {
          if (params.data === undefined || params.data === null) {
            if (DEBUG_TERMIN) {
              logger.warn('[TERMINAL ←] pty.output event has no data', { eventTabId });
            }
            return;
          }
          const output = typeof params.data === 'string' ? params.data : String(params.data);
          if (DEBUG_TERMIN) {
            logger.info('[TERMINAL ←] Writing output to terminal', {
              outputLength: output.length,
              outputPreview: output.substring(0, 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
              eventTabId,
            });
          }
          term.write(output);
          break;
        }
        case 'notification': {
          if (params.message === undefined || params.message === null) return;
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
        default: {
          if (DEBUG_TERMIN) {
            logger.warn('[TERMINAL ←] Unknown pty.output type', { type: params.type });
          }
        }
      }
    });

    return () => {
      if (DEBUG_TERMIN) {
        logger.info('[TERMINAL] Cleaning up PTY output message listener');
      }
      unsubscribe();
    };
  }, [websocketService, connectionStatus]);

  // Connection logic - runs once on mount, uses refs to avoid re-triggering
  useEffect(() => {
    cancelledRef.current = false;
    isConnectingRef.current = false;
    currentSessionIdRef.current = null;

    async function connect() {
      if (isConnectingRef.current) return;
      isConnectingRef.current = true;

      const targetTabId = sessionId && sessionId.trim().length > 0 ? sessionId : tabId;

      if (DEBUG_TERMIN) {
        logger.info(`[TERMINAL] connect: starting connection`, { tabId: targetTabId, paneId });
      }

      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        if (cancelledRef.current) return;

        setConnectAttempt(attempt);

        try {
          if (DEBUG_TERMIN) {
            logger.info(`[TERMINAL] connect: attempt ${attempt}`, { tabId: targetTabId });
          }

          if (!websocketService.isConnected()) {
            if (DEBUG_TERMIN) {
              logger.info(`[TERMINAL] connect: WebSocket not connected, connecting...`);
            }
            await websocketService.connect(resolveWebSocketUrl());
          }

          if (DEBUG_TERMIN) {
            logger.info(`[TERMINAL] connect: sending pty.connect request`, { tabId: targetTabId });
          }
          
          await websocketService.request('pty.connect', { tabId: targetTabId });

          if (DEBUG_TERMIN) {
            logger.info(`[TERMINAL] connect: sending tab.list request for scrollback`, { paneId });
          }
          
          const tabsResult = await websocketService.request<{
            tabs?: Array<{ id?: string; sessionId?: string; scrollback?: Array<{ text?: unknown }> }>;
          }>('tab.list', { paneId }).catch((error) => {
            logger.warn('Failed to load tab scrollback', { error, paneId, tabId: targetTabId });
            return null;
          });

          if (cancelledRef.current) return;

          const term = terminalRef.current;
          if (term && tabsResult?.tabs) {
            const matchingTab = tabsResult.tabs.find((candidate) => {
              if (!candidate || typeof candidate !== 'object') return false;
              if (candidate.id === tabId || candidate.id === targetTabId) return true;
              return candidate.sessionId === targetTabId;
            });

            if (matchingTab?.scrollback?.length) {
              if (DEBUG_TERMIN) {
                logger.info(`[TERMINAL] connect: applying scrollback`, {
                  scrollbackLength: matchingTab.scrollback.length,
                  tabId: matchingTab.id,
                });
              }
              applyScrollback(term, matchingTab.scrollback);
            } else if (DEBUG_TERMIN) {
              logger.warn(`[TERMINAL] connect: no matching tab or scrollback found`, {
                tabId: targetTabId,
                tabsCount: tabsResult.tabs.length,
                matchingTabFound: !!matchingTab,
                scrollbackLength: matchingTab?.scrollback?.length ?? 0,
              });
            }
          }

          currentSessionIdRef.current = targetTabId;
          isConnectingRef.current = false;
          setConnectionStatus('connected');
          logger.info('PTY connection established', { tabId: targetTabId });
          return;
        } catch (error) {
          if (cancelledRef.current) return;

          const errorMessage = extractErrorMessage(error);
          logger.warn('Connection attempt failed', { attempt, error: errorMessage, tabId: targetTabId });
          setConnectionErrors((prev) => [...prev, `Attempt ${attempt}: ${errorMessage}`]);

          if (attempt < MAX_CONNECT_ATTEMPTS) {
            const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY_MS);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (!cancelledRef.current) {
        isConnectingRef.current = false;
        setConnectionStatus('failed');
        logger.error('All connection attempts exhausted', { tabId });
      }
    }

    void connect();

    return () => {
      cancelledRef.current = true;
      isConnectingRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    const term = terminalRef.current;
    if (!container || !fitAddon || !term) return;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (currentSessionIdRef.current && connectionStatus === 'connected') {
          const { cols, rows } = term;
          debounceResize(cols, rows, currentSessionIdRef.current);
        }
      } catch {
        // ignore fit errors during init
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [connectionStatus, debounceResize]);

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
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, []);

  const handleRetry = useCallback(() => {
    cancelledRef.current = true;
    isConnectingRef.current = false;
    currentSessionIdRef.current = null;
    setConnectionErrors([]);
    setConnectAttempt(0);
    setConnectionStatus('connecting');

    // Small delay to ensure cleanup completes before re-triggering
    setTimeout(() => {
      cancelledRef.current = false;

      async function retryConnect() {
        if (isConnectingRef.current) return;
        isConnectingRef.current = true;

        const targetTabId = sessionId && sessionId.trim().length > 0 ? sessionId : tabId;

        for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
          if (cancelledRef.current) return;

          setConnectAttempt(attempt);

          try {
            if (!websocketService.isConnected()) {
              await websocketService.connect(resolveWebSocketUrl());
            }

            await websocketService.request('pty.connect', { tabId: targetTabId });

            const tabsResult = await websocketService.request<{
              tabs?: Array<{ id?: string; sessionId?: string; scrollback?: Array<{ text?: unknown }> }>;
            }>('tab.list', { paneId }).catch(() => null);

            if (cancelledRef.current) return;

            const term = terminalRef.current;
            if (term && tabsResult?.tabs) {
              const matchingTab = tabsResult.tabs.find((candidate) => {
                if (!candidate || typeof candidate !== 'object') return false;
                if (candidate.id === tabId || candidate.id === targetTabId) return true;
                return candidate.sessionId === targetTabId;
              });

              if (matchingTab?.scrollback?.length) {
                applyScrollback(term, matchingTab.scrollback);
              }
            }

            currentSessionIdRef.current = targetTabId;
            isConnectingRef.current = false;
            setConnectionStatus('connected');
            return;
          } catch (error) {
            if (cancelledRef.current) return;

            const errorMessage = extractErrorMessage(error);
            setConnectionErrors((prev) => [...prev, `Attempt ${attempt}: ${errorMessage}`]);

            if (attempt < MAX_CONNECT_ATTEMPTS) {
              const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY_MS);
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        if (!cancelledRef.current) {
          isConnectingRef.current = false;
          setConnectionStatus('failed');
        }
      }

      void retryConnect();
    }, 100);
  }, [sessionId, tabId, paneId, websocketService, applyScrollback]);

  if (connectionStatus !== 'connected') {
    return (
      <ErrorBoundary>
        <TerminalLoading
          tabId={tabId}
          maxRetries={MAX_CONNECT_ATTEMPTS}
          currentAttempt={connectAttempt}
          errors={connectionErrors}
          onRetry={handleRetry}
        />
      </ErrorBoundary>
    );
  }

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
        }}
      />
    </ErrorBoundary>
  );
}
