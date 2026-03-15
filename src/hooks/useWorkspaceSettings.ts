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
  settings: {
    color?: string;
    icon?: string;
    working_directory?: string;
    subtitle?: string;
  };
}

interface UpdateSettingsParams {
  workspace_id: string;
  color?: string;
  icon?: string;
  working_directory?: string;
  subtitle?: string;
}

interface UpdateSettingsOutput {
  settings: {
    color?: string;
    icon?: string;
    working_directory?: string;
    subtitle?: string;
  };
}

function mapSettingsResult(result: GetSettingsOutput): WorkspaceSettings {
  return {
    color: result.settings.color,
    icon: result.settings.icon,
    workingDirectory: result.settings.working_directory,
    subtitle: result.settings.subtitle,
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
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message);
      } else {
        errorMessage = String(error);
      }
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
