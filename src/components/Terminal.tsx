import { useEffect, useRef, useState } from 'react';
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
  const sessionIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
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

    // Set up PTY communication channel
    const channel = new Channel<any>();
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

    // Setup keystroke handler
    const setupDataHandler = (ptySessionId: string) => {
      term.onData((data) => {
        invoke('write_pty', { sessionId: ptySessionId, data }).catch(console.error);
      });
    };

    // Initialize PTY session - either attach to existing or spawn new
    const initPty = async () => {
      // Check if we have an existing sessionId and if the PTY is still alive
      if (sessionId) {
        try {
          const isAlive = await invoke<boolean>('is_pty_alive', { sessionId });
          if (isAlive) {
            // Attach to existing PTY session
            await invoke('attach_pty_channel', { sessionId, onEvent: channel });
            sessionIdRef.current = sessionId;
            setIsReady(true);
            setupDataHandler(sessionId);
            return;
          }
        } catch (error) {
          console.warn('Failed to check/attach to existing PTY, spawning new:', error);
        }
      }

      // Spawn a new PTY session
      try {
        const newSessionId = await invoke<string>('spawn_pty', { onEvent: channel });
        sessionIdRef.current = newSessionId;
        setIsReady(true);
        setupDataHandler(newSessionId);

        // Update the store with the new session ID
        useWorkspaceStore.getState().updateTabSessionId(paneId, tabId, newSessionId);
      } catch (error) {
        console.error('Failed to spawn PTY:', error);
        term.write(`\r\n[Error: Failed to spawn PTY: ${error}]\r\n`);
      }
    };

    initPty();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current && sessionIdRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        invoke('resize_pty', {
          sessionId: sessionIdRef.current,
          cols,
          rows,
        }).catch(console.error);
      }
    });

    resizeObserver.observe(terminalRef.current);

    // Cleanup - never kill PTY on unmount
    // PTY persists for tab lifetime, only killed when user closes tab
    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId, tabId, paneId, onNotification]);

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
