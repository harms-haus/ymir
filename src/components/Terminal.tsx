import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useXTerm } from 'react-xtermjs';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { invoke, Channel } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
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

export function Terminal({ sessionId, tabId, paneId, onNotification, hasNotification }: TerminalProps) {
  const [isReady, setIsReady] = useState(false);

  const currentSessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<Channel<{ event: string; data?: unknown }> | null>(null);
  const isConnectingRef = useRef(false);
  const onNotificationRef = useRef<((message: string) => void) | undefined>(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const fitAddon = useMemo(() => new FitAddon(), []);
  const webLinksAddon = useMemo(() => new WebLinksAddon(), []);
  const searchAddon = useMemo(() => new SearchAddon(), []);

  // Memoize options to prevent infinite re-renders
  const options = useMemo(() => ({
    ...terminalTheme,
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
  }), []);

  // Memoize addons array to prevent infinite re-renders
  const addons = useMemo(() => [
    fitAddon,
    webLinksAddon,
    searchAddon
  ], [fitAddon, webLinksAddon, searchAddon]);

  // Memoize onData callback to prevent infinite re-renders
  const onData = useCallback((data: string) => {
    if (currentSessionIdRef.current) {
      invoke('write_pty', { sessionId: currentSessionIdRef.current, data });
    }
  }, []);

  // Memoize listeners object to prevent infinite re-renders
  const listeners = useMemo(() => ({
    onData,
  }), [onData]);

  const { ref, instance } = useXTerm({
    options,
    addons,
    listeners,
  });

  useEffect(() => {
    if (!instance) return;

    async function connectToPty(sid: string | undefined, term: NonNullable<typeof instance>) {
      if (isConnectingRef.current) return;
      if (currentSessionIdRef.current) {
        setIsReady(true);
        return;
      }

      isConnectingRef.current = true;
      const correlationId = crypto.randomUUID();

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

    connectToPty(sessionId, instance);
  }, [instance, paneId, tabId, sessionId]);

  // Handle resize with ResizeObserver
  useEffect(() => {
    if (!ref.current || !fitAddon) return;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fitAddon, ref]);

  // Handle PTY resize
  useEffect(() => {
    if (!isReady || !currentSessionIdRef.current || !instance) return;

    const { cols, rows } = instance;
    const correlationId = crypto.randomUUID();

    invoke('resize_pty', {
      sessionId: currentSessionIdRef.current,
      cols,
      rows,
      correlationId,
    });
  }, [isReady, instance]);

  return (
    <ErrorBoundary>
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
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
