import { useMemo } from 'react';
import { Workspace } from '../state/types';
import { useWebSocketSubscriptionState } from './useWebSocketSubscriptionState';

interface WorkspaceListResult {
  workspaces: Workspace[];
}

interface UseWorkspacesResult {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const INITIAL_WORKSPACES: Workspace[] = [];
const WORKSPACE_NOTIFICATION_METHODS = ['workspace.state_change'] as const;

function mapWorkspaceListResult(result: WorkspaceListResult): Workspace[] {
  return result.workspaces;
}

export function useWorkspaces(): UseWorkspacesResult {
  const params = useMemo(() => ({ filter: null }), []);

  const { data, isLoading, error, refetch } = useWebSocketSubscriptionState<Workspace[], WorkspaceListResult>({
    method: 'workspace.list',
    params,
    initialData: INITIAL_WORKSPACES,
    notificationMethods: WORKSPACE_NOTIFICATION_METHODS,
    mapResult: mapWorkspaceListResult,
  });

  return {
    workspaces: data,
    isLoading,
    error,
    refetch,
  };
}
