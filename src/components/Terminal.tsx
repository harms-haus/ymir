import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke, Channel } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import '@xterm/xterm/css/xterm.css';
import useWorkspaceStore from '../state/workspace';
import { ErrorBoundary } from './ErrorBoundary';
import logger from '../lib/logger';
import { terminalTheme } from '../theme/terminal';

interface TerminalProps {
  sessionId?: string;
  tabId: string;
  paneId: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

// Cache xterm instances per tab - they persist across tab switches
const xtermCache = new Map<string, { term: XTerm; fitAddon: FitAddon }>();

export function Terminal({ sessionId, tabId, paneId, onNotification, hasNotification }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  const cacheKey = `${paneId}-${tabId}`;
  const currentSessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<Channel<any> | null>(null);
  const isConnectingRef = useRef(false);
  const dataHandlerRef = useRef<{ dispose: () => void } | null>(null);
  // Store onNotification in a ref to avoid effect re-runs when parent re-renders
  const onNotificationRef = useRef<((message: string) => void) | undefined>(onNotification);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  // Initialize xterm - once per tab, persists across switches
  useEffect(() => {
    if (!terminalRef.current) return;

    const cached = xtermCache.get(cacheKey);
    let term: XTerm;
    let fitAddon: FitAddon;
    let resizeObserver: ResizeObserver;

    if (cached) {
      // Tab was switched away and back - restore from cache
      term = cached.term;
      fitAddon = cached.fitAddon;

      // xterm element exists but was removed from DOM by React
      // We need to re-attach it
      if (term.element && !term.element.parentElement) {
        terminalRef.current.appendChild(term.element);
        fitAddon.fit();
        term.refresh(0, term.rows - 1);
      }

      // Re-attach handlers
      dataHandlerRef.current = term.onData((data) => {
        if (currentSessionIdRef.current) {
          invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
        }
      });

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalRef.current);

      setIsReady(true);
    } else {
      // New tab - create fresh xterm
      term = new XTerm({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
        theme: terminalTheme,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      // Cache it for tab switches
      xtermCache.set(cacheKey, { term, fitAddon });

      // Set up keystroke handler
      dataHandlerRef.current = term.onData((data) => {
        if (currentSessionIdRef.current) {
          invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
        }
      });

      // Set up resize observer
      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalRef.current);

      // Connect to PTY
      connectToPty(sessionId, term);
    }

    async function connectToPty(sid: string | undefined, term: XTerm) {
      if (isConnectingRef.current) return;
      if (currentSessionIdRef.current) {
        setIsReady(true);
        return;
      }

      isConnectingRef.current = true;
      const correlationId = crypto.randomUUID();

      const channel = new Channel<any>();
      channelRef.current = channel;

      channel.onmessage = (message) => {
        if (!message || typeof message !== 'object') return;

        switch (message.event) {
          case 'output':
            const outputData = message.data?.data ?? message.data;
            if (outputData !== undefined && outputData !== null) {
              const outputStr = typeof outputData === 'string' ? outputData : String(outputData);
              term.write(outputStr);
            }
            break;
          case 'notification':
            const notifMessage = message.data?.message ?? message.data;
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

    return () => {
      resizeObserver?.disconnect();
      dataHandlerRef.current?.dispose();
      dataHandlerRef.current = null;
      // DON'T remove element or dispose - keep in cache for tab switch
    };
  }, [cacheKey, paneId, tabId, sessionId]); // Note: onNotification removed - handled via ref

  // Handle PTY resize
  useEffect(() => {
    if (!isReady || !currentSessionIdRef.current) return;

    const cached = xtermCache.get(cacheKey);
    if (!cached) return;

    const { cols, rows } = cached.term;
    const correlationId = crypto.randomUUID();

    invoke('resize_pty', {
      sessionId: currentSessionIdRef.current,
      cols,
      rows,
      correlationId,
    });
  }, [isReady, cacheKey]);

  return (
    <ErrorBoundary>
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1e1e1e',
          boxShadow: hasNotification ? '0 0 0 2px #4fc3f7' : 'none',
          transition: 'box-shadow 0.2s ease',
          opacity: isReady ? 1 : 0.7,
        }}
      />
    </ErrorBoundary>
  );
}
