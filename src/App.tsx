import { useState, useEffect } from 'react';
import { init as initGhostty } from 'ghostty-web';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import logger from './lib/logger';

function App() {
  const [ghosttyReady, setGhosttyReady] = useState(false);
  const [ghosttyError, setGhosttyError] = useState<Error | null>(null);

  useEffect(() => {
    initGhostty()
      .then(() => setGhosttyReady(true))
      .catch((err) => {
        logger.error('Failed to initialize ghostty-web WASM', { error: err });
        setGhosttyError(err instanceof Error ? err : new Error(String(err)));
      });
  }, []);

  if (ghosttyError) {
    return <div>Error loading terminal: {ghosttyError.message}</div>;
  }

  if (!ghosttyReady) {
    return <div>Loading terminal...</div>;
  }

  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  );
}

export default App;

