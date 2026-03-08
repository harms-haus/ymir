import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke, Channel } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import '@xterm/xterm/css/xterm.css';
import useWorkspaceStore from '../state/workspace';

interface TerminalProps {
  sessionId?: string;
  tabId: string;
  paneId: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

export function Terminal({ sessionId, tabId, paneId, onNotification, hasNotification }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<Channel<any> | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const isConnectingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Initialize xterm once
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "NerdFontSymbols", "monospace"',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Set up keystroke handler once
    dataDisposableRef.current = term.onData((data) => {
      if (currentSessionIdRef.current) {
        invoke('write_pty', { sessionId: currentSessionIdRef.current, data }).catch(console.error);
      }
    });

    return () => {
      dataDisposableRef.current?.dispose();
      dataDisposableRef.current = null;
      fitAddonRef.current = null;
      xtermRef.current = null;
      term.dispose();
    };
  }, []);

  // Handle PTY connection (reattach or spawn)
  const connectToPty = useCallback(async (sid: string | undefined) => {
    if (!xtermRef.current) return;

    // Prevent duplicate connection attempts (e.g., from React StrictMode double-mount)
    if (isConnectingRef.current) {
      return;
    }

    const term = xtermRef.current;

    // If we're already connected to this session, do nothing
    if (currentSessionIdRef.current === sid && channelRef.current) {
      return;
    }

    isConnectingRef.current = true;

    // Set up a new channel
    const channel = new Channel<any>();
    channelRef.current = channel;

    channel.onmessage = (message) => {
      switch (message.event) {
        case 'output':
          term.write(message.data.data);
          break;
        case 'notification':
          onNotification?.(message.data.message);
          try {
            sendNotification({ title: 'Ymir', body: message.data.message });
          } catch {}
          break;
        case 'exit':
          term.write('\r\n[Process exited]\r\n');
          break;
      }
    };

    // Check if we have an existing sessionId and if the PTY is still alive
    if (sid) {
      try {
        const isAlive = await invoke<boolean>('is_pty_alive', { sessionId: sid });
        if (isAlive) {
          // Attach to existing PTY session
          await invoke('attach_pty_channel', { sessionId: sid, onEvent: channel });
          currentSessionIdRef.current = sid;
          setIsReady(true);
          isConnectingRef.current = false;
          return;
        }
      } catch (error) {
        console.warn('Failed to check/attach to existing PTY, spawning new:', error);
      }
    }

    // Spawn a new PTY session
    try {
      const newSessionId = await invoke<string>('spawn_pty', { onEvent: channel });
      currentSessionIdRef.current = newSessionId;
      setIsReady(true);

      // Update the store with the new session ID
      useWorkspaceStore.getState().updateTabSessionId(paneId, tabId, newSessionId);
    } catch (error) {
      console.error('Failed to spawn PTY:', error);
      term.write(`\r\n[Error: Failed to spawn PTY: ${error}]\r\n`);
    } finally {
      isConnectingRef.current = false;
    }
  }, [paneId, tabId, onNotification]);

  // Connect to PTY when sessionId changes or on mount
  useEffect(() => {
    connectToPty(sessionId);
  }, [sessionId, connectToPty]);

  // Handle resize
  useEffect(() => {
    if (!terminalRef.current || !xtermRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current && currentSessionIdRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        invoke('resize_pty', {
          sessionId: currentSessionIdRef.current,
          cols,
          rows,
        }).catch(console.error);
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isReady]);

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1e1e1e',
        boxShadow: hasNotification ? '0 0 0 2px #4fc3f7' : 'none',
        transition: 'box-shadow 0.2s ease',
        opacity: isReady ? 1 : 0.5,
      }}
    />
  );
}
