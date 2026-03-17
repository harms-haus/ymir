import { useEffect, useState } from 'react';
import { getWebSocketClient, type ConnectionStatus } from '../lib/ws';
import type { YmirClient } from '../lib/ws';

export interface UseWebSocketReturn {
  client: YmirClient;
  status: ConnectionStatus;
  error: string | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const [client] = useState(() => getWebSocketClient());
  const [status, setStatus] = useState<ConnectionStatus>(client.getStatus());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeStatus = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Subscribe to disconnections to capture errors
    const unsubscribeDisconnect = client.onDisconnect(() => {
      setError('WebSocket disconnected');
    });

    // Subscribe to reconnections to clear errors
    const unsubscribeReconnect = client.onReconnect(() => {
      setError(null);
    });

    // Clean up subscriptions on unmount
    return () => {
      unsubscribeStatus();
      unsubscribeDisconnect();
      unsubscribeReconnect();
    };
  }, [client]);

  return {
    client,
    status,
    error,
  };
}

export function useWebSocketClient(): YmirClient {
  return getWebSocketClient();
}

export function useWebSocketStatus(): ConnectionStatus {
  const client = getWebSocketClient();
  const [status, setStatus] = useState<ConnectionStatus>(client.getStatus());

  useEffect(() => {
    const unsubscribe = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, [client]);

  return status;
}

export function useIsConnected(): boolean {
  const client = getWebSocketClient();
  const [isConnected, setIsConnected] = useState<boolean>(client.isConnected());

  useEffect(() => {
    const unsubscribe = client.onStatusChange((status) => {
      setIsConnected(status === 'open');
    });

    return unsubscribe;
  }, [client]);

  return isConnected;
}
