import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';
import { invoke, Channel } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import useWorkspaceStore from '../state/workspace';
import { ErrorBoundary } from './ErrorBoundary';
import logger from '../lib/logger';
import { terminalTheme } from '../theme/terminal';
import { generateUUID } from '../lib/utils';

interface TerminalProps {
  sessionId?: string;
  tabId: string;
  paneId: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

export function Terminal({ sessionId, tabId, paneId, onNotification, hasNotification }: TerminalProps) {
  const [isReady, setIsReady] = useState(false);

  const fontSize = useWorkspaceStore((state) => state.fontSize);

  const currentSessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<Channel<{ event: string; data?: unknown }> | null>(null);
  const isConnectingRef = useRef(false);
  const onNotificationRef = useRef<((message: string) => void) | undefined>(onNotification);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ghostty-web refs
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<GhosttyTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const debounceResize = useCallback((cols: number, rows: number, sessionId: string) => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      const correlationId = generateUUID();
      invoke('resize_pty', { sessionId, cols, rows, correlationId }).catch((error) => {
        logger.warn('Failed to resize PTY', { error, sessionId, cols, rows });
      });
    }, 100);
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
        invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
      }
    });

    return () => disposable.dispose();
  }, []);

  // Connect to PTY
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    async function connectToPty(sid: string | undefined, term: GhosttyTerminal) {
      if (isConnectingRef.current) return;
      if (currentSessionIdRef.current) {
        setIsReady(true);
        return;
      }

      isConnectingRef.current = true;
      const correlationId = generateUUID();

      const channel = new Channel<{ event: string; data?: unknown }>();
      channelRef.current = channel;

      channel.onmessage = (message) => {
        if (!message || typeof message !== 'object') return;

        switch (message.event) {
          case 'output': {
            const outputData = (message.data as { data?: string })?.data ?? message.data;
            if (outputData !== undefined && outputData !== null) {
              const outputStr = typeof outputData === 'string' ? outputData : String(outputData);
              term.write(outputStr);
            }
            break;
          }
          case 'notification': {
            const notifMessage = (message.data as { message?: string })?.message ?? message.data;
            if (notifMessage !== undefined && notifMessage !== null) {
              const messageStr = typeof notifMessage === 'string' ? notifMessage : String(notifMessage);
              onNotificationRef.current?.(messageStr);
              try {
                sendNotification({ title: 'Ymir', body: messageStr });
              } catch (error) {
                logger.warn('Failed to send desktop notification', { error });
              }
            }
            break;
          }
          case 'exit':
            term.write('\r\n[Process exited]\r\n');
            break;
        }
      };

      if (sid) {
        try {
          const isAlive = await invoke<boolean>('is_pty_alive', { sessionId: sid, correlationId });
          if (isAlive) {
            await invoke('attach_pty_channel', { sessionId: sid, onEvent: channel, correlationId });
            currentSessionIdRef.current = sid;
            setIsReady(true);
            isConnectingRef.current = false;
            return;
          }
        } catch (error) {
          logger.warn('Failed to attach, spawning new', { sessionId: sid, error });
        }
      }

      try {
        const newSessionId = await invoke<string>('spawn_pty', { onEvent: channel, correlationId });
        currentSessionIdRef.current = newSessionId;
        setIsReady(true);
        useWorkspaceStore.getState().updateTabSessionId(paneId, tabId, newSessionId);
      } catch (error) {
        logger.error('Failed to spawn PTY', { error });
        term.write('\r\n[Error: Failed to spawn PTY]\r\n');
      } finally {
        isConnectingRef.current = false;
      }
    }

    connectToPty(sessionId, term);
  }, [paneId, tabId, sessionId]);

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
      } catch (error) {
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
        const { zoomIn, zoomOut } = useWorkspaceStore.getState();
        if (e.deltaY < 0) {
          zoomIn();
        } else if (e.deltaY > 0) {
          zoomOut();
        }
      }
    };

    const terminalElement = containerRef.current;
    terminalElement?.addEventListener('wheel', handleWheel, { passive: false });
    return () => terminalElement?.removeEventListener('wheel', handleWheel);
  }, []);

  // Listen for title changes and update tab title
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    const disposable = term.onTitleChange((newTitle: string) => {
      if (newTitle && newTitle.trim()) {
        useWorkspaceStore.getState().updateTabTitle(paneId, tabId, newTitle.trim());
      }
    });

    return () => disposable.dispose();
  }, [paneId, tabId]);

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
