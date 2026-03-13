import { useMemo } from 'react';
import { GitFile, GitFileStatus, GitRepo } from '../state/types';
import { useWebSocketSubscriptionState } from './useWebSocketSubscriptionState';

type ServerGitFileStatus =
  | 'added'
  | 'stagedModified'
  | 'stagedDeleted'
  | 'stagedRenamed'
  | 'modified'
  | 'deleted'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'clean'
  | 'Added'
  | 'StagedModified'
  | 'StagedDeleted'
  | 'StagedRenamed'
  | 'Modified'
  | 'Deleted'
  | 'Untracked'
  | 'Ignored'
  | 'Conflicted'
  | 'Clean';

type CanonicalGitFileStatus =
  | 'added'
  | 'stagedModified'
  | 'stagedDeleted'
  | 'stagedRenamed'
  | 'modified'
  | 'deleted'
  | 'untracked'
  | 'ignored'
  | 'conflicted'
  | 'clean';

interface ServerGitFile {
  path: string;
  status: ServerGitFileStatus;
  secondaryStatus?: ServerGitFileStatus | null;
}

interface ServerGitStatus {
  repoPath: string;
  currentBranch: string;
  files: ServerGitFile[];
  aheadCount: number;
  behindCount: number;
}

interface GitStatusResult {
  status: ServerGitStatus;
}

interface GitStateChangeNotification {
  action: string;
  repoPath?: string;
}

interface UseGitResult {
  repo: GitRepo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const GIT_NOTIFICATION_METHODS = ['git.state_change'] as const;

function normalizeServerStatus(status: ServerGitFileStatus): CanonicalGitFileStatus {
  switch (status) {
    case 'added':
    case 'Added':
      return 'added';

    case 'stagedModified':
    case 'StagedModified':
      return 'stagedModified';

    case 'stagedDeleted':
    case 'StagedDeleted':
      return 'stagedDeleted';

    case 'stagedRenamed':
    case 'StagedRenamed':
      return 'stagedRenamed';

    case 'modified':
    case 'Modified':
      return 'modified';

    case 'deleted':
    case 'Deleted':
      return 'deleted';

    case 'untracked':
    case 'Untracked':
      return 'untracked';

    case 'conflicted':
    case 'Conflicted':
      return 'conflicted';

    case 'ignored':
    case 'Ignored':
      return 'ignored';

    case 'clean':
    case 'Clean':
      return 'clean';

    default:
      return 'modified';
  }
}

function mapServerFileStatus(status: ServerGitFileStatus): GitFileStatus {
  switch (normalizeServerStatus(status)) {
    case 'added':
    case 'stagedModified':
      return 'added';
    case 'modified':
      return 'modified';
    case 'stagedDeleted':
    case 'deleted':
      return 'deleted';
    case 'untracked':
      return 'untracked';
    case 'stagedRenamed':
      return 'renamed';
    case 'conflicted':
      return 'conflict';
    case 'ignored':
    case 'clean':
      return 'modified';
    default:
      return 'modified';
  }
}

function transformGitStatus(status: ServerGitStatus): GitRepo {
  const staged: GitFile[] = [];
  const unstaged: GitFile[] = [];

  for (const file of status.files) {
    const primaryStatus = normalizeServerStatus(file.status);
    const secondaryStatus = file.secondaryStatus ? normalizeServerStatus(file.secondaryStatus) : null;

    if (
      primaryStatus === 'added' ||
      primaryStatus === 'stagedModified' ||
      primaryStatus === 'stagedDeleted' ||
      primaryStatus === 'stagedRenamed'
    ) {
      staged.push({
        path: file.path,
        status: mapServerFileStatus(primaryStatus),
        staged: true,
      });
    }

    const hasUnstaged =
      primaryStatus === 'modified' ||
      primaryStatus === 'deleted' ||
      primaryStatus === 'untracked' ||
      primaryStatus === 'conflicted' ||
      secondaryStatus === 'modified' ||
      secondaryStatus === 'deleted' ||
      secondaryStatus === 'untracked' ||
      secondaryStatus === 'conflicted';

    if (hasUnstaged) {
      const unstagedStatus = secondaryStatus ?? primaryStatus;
      unstaged.push({
        path: file.path,
        status: mapServerFileStatus(unstagedStatus),
        staged: false,
      });
    }
  }

  return {
    path: status.repoPath,
    branch: status.currentBranch,
    ahead: status.aheadCount,
    behind: status.behindCount,
    staged,
    unstaged,
  };
}

function mapGitStatusResult(result: GitStatusResult): GitRepo {
  return transformGitStatus(result.status);
}

export function useGit(repoPath: string | null | undefined): UseGitResult {
  const params = useMemo(
    () => (repoPath ? { repoPath } : undefined),
    [repoPath],
  );

  const shouldRefetchOnNotification = useMemo(
    () =>
      (notificationParams: unknown): boolean => {
        if (!repoPath) {
          return false;
        }

        if (!notificationParams || typeof notificationParams !== 'object') {
          return true;
        }

        const notification = notificationParams as GitStateChangeNotification;
        return !notification.repoPath || notification.repoPath === repoPath;
      },
    [repoPath],
  );

  const { data, isLoading, error, refetch } = useWebSocketSubscriptionState<GitRepo | null, GitStatusResult>({
    method: 'git.status',
    params,
    enabled: Boolean(repoPath),
    initialData: null,
    notificationMethods: GIT_NOTIFICATION_METHODS,
    mapResult: mapGitStatusResult,
    shouldRefetchOnNotification,
  });

  return {
    repo: data,
    isLoading,
    error,
    refetch,
  };
}
