import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceSettings } from './useWorkspaceSettings';

const websocketServiceMock = {
  isConnected: vi.fn(() => false),
  request: vi.fn(),
};

const useWebSocketSubscriptionStateMock = vi.fn();

vi.mock('./useWebSocketSubscriptionState', () => ({
  useWebSocketSubscriptionState: (options: unknown) => useWebSocketSubscriptionStateMock(options),
}));

vi.mock('../services/websocket', () => ({
  getWebSocketService: () => websocketServiceMock,
  ensureWebSocketConnected: vi.fn(),
}));

describe('useWorkspaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load settings on mount with correct params', () => {
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: { color: '#ef4444', icon: 'terminal', workingDirectory: '/home/user', subtitle: 'Development' },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    expect(useWebSocketSubscriptionStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'workspace.getSettings',
        params: { workspace_id: 'workspace-123' },
        initialData: null,
        notificationMethods: ['workspace.settings_changed'],
      })
    );

    expect(result.current.settings).toEqual({
      color: '#ef4444',
      icon: 'terminal',
      workingDirectory: '/home/user',
      subtitle: 'Development',
    });
  });

  it('should map snake_case to camelCase correctly', () => {
    useWebSocketSubscriptionStateMock.mockImplementation(({ mapResult }) => ({
      data: mapResult({
        color: '#3b82f6',
        icon: 'folder',
        working_directory: '/workspace',
        subtitle: 'Project',
      }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    expect(result.current.settings).toEqual({
      color: '#3b82f6',
      icon: 'folder',
      workingDirectory: '/workspace',
      subtitle: 'Project',
    });
  });

  it('should handle loading state', () => {
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should handle fetch errors', () => {
    const fetchError = 'Failed to fetch settings';
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: fetchError,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    expect(result.current.error).toBe(fetchError);
    expect(result.current.loading).toBe(false);
  });

  it('should call updateSettings with correct params', async () => {
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: { color: '#ef4444', icon: 'terminal' },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    websocketServiceMock.request.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    await act(async () => {
      await result.current.updateSettings({ color: '#3b82f6' });
    });

    expect(websocketServiceMock.request).toHaveBeenCalledWith(
      'workspace.updateSettings',
      expect.objectContaining({
        workspace_id: 'workspace-123',
        color: '#3b82f6',
      })
    );

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('should update all settings fields', async () => {
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    websocketServiceMock.request.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    await act(async () => {
      await result.current.updateSettings({
        color: '#3b82f6',
        icon: 'folder',
        workingDirectory: '/home/user',
        subtitle: 'New subtitle',
      });
    });

    expect(websocketServiceMock.request).toHaveBeenCalledWith(
      'workspace.updateSettings',
      {
        workspace_id: 'workspace-123',
        color: '#3b82f6',
        icon: 'folder',
        working_directory: '/home/user',
        subtitle: 'New subtitle',
      }
    );
  });

  it('should map camelCase to snake_case for updateSettings', async () => {
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    websocketServiceMock.request.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    await act(async () => {
      await result.current.updateSettings({ workingDirectory: '/new/path' });
    });

    expect(websocketServiceMock.request).toHaveBeenCalledWith(
      'workspace.updateSettings',
      {
        workspace_id: 'workspace-123',
        working_directory: '/new/path',
      }
    );
  });

  it('should handle update errors gracefully', async () => {
    const mockError = new Error('Failed to update settings');
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    websocketServiceMock.request.mockRejectedValue(mockError);

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    await expect(
      act(async () => {
        await result.current.updateSettings({ color: '#3b82f6' });
      })
    ).rejects.toThrow('Failed to update settings');

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('should clear update error on new update attempt', async () => {
    const mockRefetch = vi.fn();
    useWebSocketSubscriptionStateMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    websocketServiceMock.request
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useWorkspaceSettings('workspace-123'));

    await expect(
      act(async () => {
        await result.current.updateSettings({ color: '#3b82f6' });
      })
    ).rejects.toThrow('First error');

    await act(async () => {
      await result.current.updateSettings({ color: '#ef4444' });
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

});
