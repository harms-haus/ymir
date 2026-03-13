import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGit } from './useGit';

const useWebSocketSubscriptionStateMock = vi.fn();

vi.mock('./useWebSocketSubscriptionState', () => ({
  useWebSocketSubscriptionState: (options: unknown) => useWebSocketSubscriptionStateMock(options),
}));

describe('useGit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps camelCase websocket file statuses into repo staged/unstaged lists', () => {
    useWebSocketSubscriptionStateMock.mockImplementation(({ mapResult }) => ({
      data: mapResult({
        status: {
          repoPath: '/workspace/repo',
          currentBranch: 'main',
          aheadCount: 0,
          behindCount: 0,
          files: [
            { path: '.task26-live-check.txt', status: 'untracked', secondaryStatus: null },
            { path: 'src/app.ts', status: 'stagedModified', secondaryStatus: 'modified' },
          ],
        },
      }),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));

    const { result } = renderHook(() => useGit('/workspace/repo'));

    expect(result.current.repo?.unstaged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '.task26-live-check.txt', status: 'untracked', staged: false }),
        expect.objectContaining({ path: 'src/app.ts', status: 'modified', staged: false }),
      ]),
    );
    expect(result.current.repo?.staged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/app.ts', status: 'added', staged: true }),
      ]),
    );
  });
});
