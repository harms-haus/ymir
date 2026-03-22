import type { GitStatusEntry } from '../../types/protocol';

export const statusConfig: Record<string, { label: string; color: string }> = {
  modified: { label: 'M', color: 'hsl(var(--git-modified))' },
  added: { label: 'A', color: 'hsl(var(--git-added))' },
  deleted: { label: 'D', color: 'hsl(var(--git-deleted))' },
  renamed: { label: 'R', color: 'hsl(var(--git-renamed))' },
  untracked: { label: 'U', color: 'hsl(var(--git-untracked))' },
};

interface GitStatusBadgeProps {
  status: GitStatusEntry['status'];
  staged: boolean;
}

export function GitStatusBadge({ status, staged }: GitStatusBadgeProps) {
  const config = statusConfig[status] || { label: '?', color: 'hsl(var(--muted-foreground))' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        fontSize: '11px',
        fontWeight: 600,
        color: config.color,
        opacity: staged ? 1 : 0.5,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {config.label}
    </span>
  );
}

export function parseStatusCode(statusCode: string): { status: GitStatusEntry['status']; staged: boolean } {
  if (statusCode === '??') {
    return { status: 'untracked', staged: false };
  }

  // Defensive: ensure statusCode has at least 2 characters
  if (statusCode.length < 2) {
    return { status: 'modified', staged: false };
  }

  const stagedChar = statusCode[0];
  const unstagedChar = statusCode[1];

  // Prioritize staged status (index) - if there's a staged change, it takes precedence.
  // For dual-status codes (e.g., "MM", "AM"), we return the staged state since the
  // file has already been added to the index and will be committed in that state.
  if (stagedChar === 'A') return { status: 'added', staged: true };
  if (stagedChar === 'D') return { status: 'deleted', staged: true };
  if (stagedChar === 'R') return { status: 'renamed', staged: true };
  if (stagedChar === 'M') return { status: 'modified', staged: true };

  // If no staged change, check unstaged (worktree) status
  if (unstagedChar === 'M') return { status: 'modified', staged: false };
  if (unstagedChar === 'D') return { status: 'deleted', staged: false };

  // Default fallback for unhandled cases
  return { status: 'modified', staged: false };
}

export function transformStatusEntries(
  entries: Array<{ path: string; statusCode: string }>
): GitStatusEntry[] {
  return entries.map((entry) => {
    const { status, staged } = parseStatusCode(entry.statusCode);
    return {
      path: entry.path,
      status,
      staged,
    };
  });
}