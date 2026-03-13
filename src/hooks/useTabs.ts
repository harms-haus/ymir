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

const TAB_NOTIFICATION_METHODS = ['tab.state_change'] as const;
const INITIAL_TABS: Tab[] = [];

function mapTabListResult(result: TabListResult): Tab[] {
  return result.tabs;
}

export function useTabs(paneId: string | null | undefined): UseTabsResult {
  const params = useMemo(() => (paneId ? { paneId } : undefined), [paneId]);

  const { data, isLoading, error, refetch } = useWebSocketSubscriptionState<Tab[], TabListResult>({
    method: 'tab.list',
    params,
    enabled: Boolean(paneId),
    initialData: INITIAL_TABS,
    notificationMethods: TAB_NOTIFICATION_METHODS,
    mapResult: mapTabListResult,
  });

  return {
    tabs: data,
    isLoading,
    error,
    refetch,
  };
}
