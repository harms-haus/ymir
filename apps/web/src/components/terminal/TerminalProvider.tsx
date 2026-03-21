import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { TerminalOutput } from '../../types/protocol';
import { setTerminalOutputCallback } from '../../store';
import { initializeGhostty, isGhosttyInitialized } from './TerminalView';

export interface TerminalInstance {
  sessionId: string;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

interface TerminalContextValue {
  registerTerminal: (instance: TerminalInstance) => () => void;
  writeToTerminal: (sessionId: string, data: string) => void;
  isInitialized: boolean;
  initialize: () => Promise<void>;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export interface TerminalProviderProps {
  children: React.ReactNode;
}

export function TerminalProvider({ children }: TerminalProviderProps) {
  const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map());
  const [isInitialized, setIsInitialized] = useState(isGhosttyInitialized());

  const registerTerminal = useCallback((instance: TerminalInstance) => {
    terminalsRef.current.set(instance.sessionId, instance);

    return () => {
      terminalsRef.current.delete(instance.sessionId);
    };
  }, []);

  const writeToTerminal = useCallback((sessionId: string, data: string) => {
    const terminal = terminalsRef.current.get(sessionId);
    if (terminal) {
      terminal.write(data);
    }
  }, []);

  useEffect(() => {
    const callback = (message: TerminalOutput) => {
      writeToTerminal(message.sessionId, message.data);
    };

    setTerminalOutputCallback(callback);

    return () => {
      setTerminalOutputCallback(null);
    };
  }, [writeToTerminal]);

  const initialize = useCallback(async () => {
    await initializeGhostty();
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAsync = async () => {
      try {
        if (!isGhosttyInitialized()) {
          await initializeGhostty();
          if (isMounted) {
            setIsInitialized(true);
          }
        }
      } catch (error) {
        console.error('Failed to initialize ghostty:', error);
      }
    };

    void initAsync();

    return () => {
      isMounted = false;
    };
  }, []);

  const value: TerminalContextValue = {
    registerTerminal,
    writeToTerminal,
    isInitialized,
    initialize,
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminalContext(): TerminalContextValue {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error(
      'useTerminalContext must be used within a TerminalProvider'
    );
  }
  return context;
}

export function useTerminal(sessionId: string) {
  const context = useTerminalContext();
  const terminalRef = useRef<{
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
  } | null>(null);

  const register = useCallback(
    (write: (data: string) => void, resize: (cols: number, rows: number) => void) => {
      const instance: TerminalInstance = {
        sessionId,
        write,
        resize,
      };
      terminalRef.current = { write, resize };
      return context.registerTerminal(instance);
    },
    [context, sessionId]
  );

  return {
    register,
    writeToTerminal: context.writeToTerminal,
    isInitialized: context.isInitialized,
  };
}

export default TerminalProvider;
