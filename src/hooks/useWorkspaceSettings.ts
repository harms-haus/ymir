import { useCallback, useMemo, useState } from 'react';
import { useWebSocketSubscriptionState } from './useWebSocketSubscriptionState';
import { ensureWebSocketConnected, getWebSocketService } from '../services/websocket';

export interface WorkspaceSettings {
  color?: string;
  icon?: string;
  workingDirectory?: string;
  subtitle?: string;
}

export interface UseWorkspaceSettingsResult {
  settings: WorkspaceSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (updates: Partial<WorkspaceSettings>) => Promise<void>;
}

interface GetSettingsParams {
  workspace_id: string;
}

interface GetSettingsOutput {
  color?: string;
  icon?: string;
  working_directory?: string;
  subtitle?: string;
}

interface UpdateSettingsParams {
  workspace_id: string;
  color?: string;
  icon?: string;
  working_directory?: string;
  subtitle?: string;
}

interface UpdateSettingsOutput {
  success: boolean;
}

function mapSettingsResult(result: GetSettingsOutput): WorkspaceSettings {
  return {
    color: result.color,
    icon: result.icon,
    workingDirectory: result.working_directory,
    subtitle: result.subtitle,
  };
}

export function useWorkspaceSettings(workspaceId: string): UseWorkspaceSettingsResult {
  const websocketService = useMemo(() => getWebSocketService(), []);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const params = useMemo<GetSettingsParams>(
    () => ({ workspace_id: workspaceId }),
    [workspaceId]
  );

  const {
    data: settings,
    isLoading,
    error: fetchError,
    refetch,
  } = useWebSocketSubscriptionState<WorkspaceSettings | null, GetSettingsOutput>({
    method: 'workspace.getSettings',
    params,
    initialData: null,
    notificationMethods: ['workspace.settings_changed'],
    mapResult: mapSettingsResult,
  });

  const updateSettings = useCallback(
    async (updates: Partial<WorkspaceSettings>): Promise<void> => {
      setUpdateError(null);

      try {
        if (!websocketService.isConnected()) {
          await ensureWebSocketConnected();
        }

        const params: UpdateSettingsParams = {
          workspace_id: workspaceId,
        };

        if (updates.color !== undefined) {
          params.color = updates.color;
        }
        if (updates.icon !== undefined) {
          params.icon = updates.icon;
        }
        if (updates.workingDirectory !== undefined) {
          params.working_directory = updates.workingDirectory;
        }
        if (updates.subtitle !== undefined) {
          params.subtitle = updates.subtitle;
        }

        await websocketService.request<UpdateSettingsOutput>('workspace.updateSettings', params);
        await refetch();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setUpdateError(errorMessage);
        throw error;
      }
    },
    [workspaceId, websocketService, refetch]
  );

  const error = fetchError || updateError;

  return {
    settings,
    loading: isLoading,
    error,
    updateSettings,
  };
}
