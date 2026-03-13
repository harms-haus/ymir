import { useMemo } from 'react';
import { Pane } from '../state/types';
import { useWebSocketSubscriptionState } from './useWebSocketSubscriptionState';

interface PaneListResult {
  panes: Pane[];
}

interface UsePanesResult {
  panes: Pane[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePanes(workspaceId: string | null | undefined): UsePanesResult {
  const params = useMemo(
    () => (workspaceId ? { workspaceId } : undefined),
    [workspaceId],
  );

  const { data, isLoading, error, refetch } = useWebSocketSubscriptionState<Pane[], PaneListResult>({
    method: 'pane.list',
    params,
    enabled: Boolean(workspaceId),
    initialData: [],
    notificationMethods: ['pane.state_change'],
    mapResult: (result) => result.panes,
  });

  return {
    panes: data,
    isLoading,
    error,
    refetch,
  };
}
