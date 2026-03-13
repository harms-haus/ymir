import { useMemo } from 'react';
import { Tab } from '../state/types';
import { useWebSocketSubscriptionState } from './useWebSocketSubscriptionState';

interface TabListResult {
  tabs: Tab[];
}

interface UseTabsResult {
  tabs: Tab[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTabs(paneId: string | null | undefined): UseTabsResult {
  const params = useMemo(() => (paneId ? { paneId } : undefined), [paneId]);

  const { data, isLoading, error, refetch } = useWebSocketSubscriptionState<Tab[], TabListResult>({
    method: 'tab.list',
    params,
    enabled: Boolean(paneId),
    initialData: [],
    notificationMethods: ['tab.state_change'],
    mapResult: (result) => result.tabs,
  });

  return {
    tabs: data,
    isLoading,
    error,
    refetch,
  };
}
