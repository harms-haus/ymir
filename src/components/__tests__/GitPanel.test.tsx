import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { gitPanelDefinition } from '../GitPanel';
import { GitRepo } from '../../state/types';

const discoverAndRegisterReposMock = vi.fn();
const getAllGitReposMock = vi.fn();
const getGitErrorMock = vi.fn();
const useGitMock = vi.fn();
const websocketRequestMock = vi.fn();
const websocketOnMessageMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('/workspace'),
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../state/workspace', () => ({
  __esModule: true,
  default: () => ({ discoverAndRegisterRepos: discoverAndRegisterReposMock }),
  getAllGitRepos: () => getAllGitReposMock(),
  getGitChangesCount: () => 3,
  getGitError: () => getGitErrorMock(),
}));

vi.mock('../../hooks/useGit', () => ({
  useGit: (repoPath: string) => useGitMock(repoPath),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocketService: () => ({
    request: websocketRequestMock,
    onMessage: websocketOnMessageMock,
  }),
}));

vi.mock('../../lib/git-service', () => ({
  default: {
    discardChanges: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
  },
}));

const repoPath = '/workspace/repo';
const mockRepo: GitRepo = {
  path: repoPath,
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: [{ path: 'src/staged.ts', status: 'modified', staged: true }],
  unstaged: [{ path: '.task26-live-check.txt', status: 'untracked', staged: false }],
};

describe('GitPanel WebSocket integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllGitReposMock.mockReturnValue([{ path: repoPath }]);
    getGitErrorMock.mockReturnValue(null);
    websocketOnMessageMock.mockReturnValue(() => undefined);

    websocketRequestMock.mockImplementation((method: string) => {
      if (method === 'git.branches') {
        return Promise.resolve({ branches: [{ name: 'main' }, { name: 'feature/x' }] });
      }
      return Promise.resolve({ success: true });
    });

    useGitMock.mockReturnValue({
      repo: mockRepo,
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('loads repo state from useGit and renders git status', async () => {
    const Panel = gitPanelDefinition.fullRender;
    render(<Panel />);

    expect(useGitMock).toHaveBeenCalledWith(repoPath);
    expect(await screen.findByText('staged.ts')).toBeInTheDocument();
    expect(screen.getByText('.task26-live-check.txt')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  it('uses websocket git.stage and git.unstage commands', async () => {
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    useGitMock.mockReturnValue({
      repo: mockRepo,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    const Panel = gitPanelDefinition.fullRender;
    render(<Panel />);

    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(websocketRequestMock).toHaveBeenCalledWith('git.stage', {
        repoPath,
        filePath: '.task26-live-check.txt',
      });
      expect(websocketRequestMock).toHaveBeenCalledWith('git.unstage', {
        repoPath,
        filePath: 'src/staged.ts',
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });

  it('commits staged changes through websocket git.commit', async () => {
    const refetchMock = vi.fn().mockResolvedValue(undefined);
    useGitMock.mockReturnValue({
      repo: mockRepo,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    const Panel = gitPanelDefinition.fullRender;
    const { container } = render(<Panel />);

    const input = await screen.findByPlaceholderText('Commit message...');
    fireEvent.change(input, { target: { value: 'feat: websocket commit' } });
    fireEvent.click(container.querySelector('.git-commit-icon-button') as HTMLButtonElement);

    await waitFor(() => {
      expect(websocketRequestMock).toHaveBeenCalledWith('git.commit', {
        repoPath,
        message: 'feat: websocket commit',
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });
});
