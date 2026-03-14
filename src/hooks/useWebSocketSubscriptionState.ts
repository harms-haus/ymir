import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type JsonRpcIncomingMessage,
  type JsonRpcNotification,
  ensureWebSocketConnected,
  getWebSocketService,
} from '../services/websocket';

interface UseWebSocketSubscriptionStateOptions<TData, TResult> {
  method: string;
  params?: unknown;
  enabled?: boolean;
  initialData: TData;
  notificationMethods: readonly string[];
  mapResult: (result: TResult) => TData;
  shouldRefetchOnNotification?: (params: unknown) => boolean;
}

interface UseWebSocketSubscriptionStateReturn<TData> {
  data: TData;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const candidate = error as { message?: unknown };
  if (typeof candidate.message === 'string' && candidate.message.length > 0) {
    return candidate.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown WebSocket error';
  }
}

function isNotification(message: JsonRpcIncomingMessage): message is JsonRpcNotification {
  return 'method' in message;
}

export function useWebSocketSubscriptionState<TData, TResult>(
  options: UseWebSocketSubscriptionStateOptions<TData, TResult>,
): UseWebSocketSubscriptionStateReturn<TData> {
  const {
    method,
    params,
    enabled = true,
    initialData,
    notificationMethods,
    mapResult,
    shouldRefetchOnNotification,
  } = options;

  const websocketService = useMemo(() => getWebSocketService(), []);
  const [data, setData] = useState<TData>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      setError(null);
      return;
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    setIsLoading(true);
    setError(null);

    // Use aggressive timeout to fail fast and prevent UI blocking (3 seconds)
    // This is critical for window controls to remain functional even when WebSocket fails
    const requestTimeoutMs = 3000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), requestTimeoutMs);

    try {
      if (!websocketService.isConnected()) {
        await ensureWebSocketConnected();
      }
      const result = await websocketService.request<TResult>(method, params, requestTimeoutMs);
      if (requestGenerationRef.current !== generation) {
        clearTimeout(timeoutId);
        return;
      }
      clearTimeout(timeoutId);
      setData(mapResult(result));
    } catch (requestError) {
      if (requestGenerationRef.current !== generation) {
        clearTimeout(timeoutId);
        return;
      }
      clearTimeout(timeoutId);
      // Fail silently in production - allow UI to keep working
      // This is critical for window controls and drag functionality
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        setError(null);
        // Keep old data on error to prevent UI from disappearing
      } else {
        setError(extractErrorMessage(requestError));
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setIsLoading(false);
      }
    }
  }, [enabled, mapResult, method, params, websocketService]);

  useEffect(() => {
    if (!enabled) {
      requestGenerationRef.current += 1;
      setData(initialData);
      setIsLoading(false);
      setError(null);
      return;
    }

    void refetch();
  }, [enabled, initialData, refetch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return websocketService.onMessage((message) => {
      if (!isNotification(message)) {
        return;
      }

      if (!notificationMethods.includes(message.method)) {
        return;
      }

      if (shouldRefetchOnNotification && !shouldRefetchOnNotification(message.params)) {
        return;
      }

      void refetch();
    });
  }, [enabled, notificationMethods, refetch, shouldRefetchOnNotification, websocketService]);

  return { data, isLoading, error, refetch };
}
