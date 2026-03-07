import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke, Channel } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId?: string;
  onNotification?: (message: string) => void;
  hasNotification?: boolean;
}

export function Terminal({ sessionId: _initialSessionId, onNotification, hasNotification }: TerminalProps) {
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

    // Set up PTY communication
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

    // Spawn PTY and store session ID
    invoke<string>('spawn_pty', { onEvent: channel })
      .then((id) => {
        sessionIdRef.current = id;
        setIsReady(true);

        // Send keystrokes to PTY
        term.onData((data) => {
          invoke('write_pty', { sessionId: id, data }).catch(console.error);
        });
      })
      .catch((error) => {
        console.error('Failed to spawn PTY:', error);
        term.write(`\r\n[Error: Failed to spawn PTY: ${error}]\r\n`);
      });

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

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      term.dispose();
      if (sessionIdRef.current) {
        invoke('kill_pty', { sessionId: sessionIdRef.current }).catch(console.error);
      }
    };
  }, [onNotification]);

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
