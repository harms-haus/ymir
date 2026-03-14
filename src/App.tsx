import { useState, useEffect } from 'react';
import { init as initGhostty } from 'ghostty-web';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import logger from './lib/logger';
import { ensureWebSocketConnected } from './services/websocket';

function App() {
  const [ghosttyReady, setGhosttyReady] = useState(false);
  const [ghosttyError, setGhosttyError] = useState<Error | null>(null);
  const [websocketReady, setWebsocketReady] = useState(false);

  // Check if running in Tauri environment
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    initGhostty()
      .then(() => {
        setGhosttyReady(true);
        // Only initialize WebSocket after Ghostty is ready and we're not in Tauri
        // In Tauri mode, the server should be started by the Tauri sidecar
        if (!isTauri) {
          ensureWebSocketConnected()
            .then(() => setWebsocketReady(true))
            .catch((err) => {
              logger.warn('WebSocket connection failed in web mode', { error: err });
              // In web mode, WebSocket is optional
              setWebsocketReady(true);
            });
        } else {
          // In Tauri mode, skip explicit WebSocket connection (managed by sidecar)
          setWebsocketReady(true);
        }
      })
      .catch((err) => {
        logger.error('Failed to initialize ghostty-web WASM', { error: err });
        setGhosttyError(err instanceof Error ? err : new Error(String(err)));
      });
  }, [isTauri]);

  if (ghosttyError) {
    return <div>Error loading terminal: {ghosttyError.message}</div>;
  }

  if (!ghosttyReady || !websocketReady) {
    return <div>Loading terminal...</div>;
  }

  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  );
}

export default App;

