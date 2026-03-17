import { useState } from 'react';
import { useStore, selectActiveWorktree } from '../../store';
import { CreatePRDialog } from '../dialogs/CreatePRDialog';

export function ProjectPanel() {
  const activeWorktree = useStore(selectActiveWorktree);
  const [isPRDialogOpen, setIsPRDialogOpen] = useState(false);

  const canCreatePR = activeWorktree?.status === 'active';

  return (
    <div className="project-container">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Project</h2>
        <button
          type="button"
          onClick={() => setIsPRDialogOpen(true)}
          disabled={!canCreatePR}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: canCreatePR ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
            color: 'hsl(var(--primary-foreground))',
            cursor: canCreatePR ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: canCreatePR ? 1 : 0.5,
          }}
        >
          <i className="ri-git-pull-request-line" style={{ fontSize: '14px' }} />
          PR
        </button>
      </div>
      <div className="panel-content">
        <div className="file-list">
          <p className="placeholder-text">Files will appear here</p>
        </div>
      </div>

      <CreatePRDialog open={isPRDialogOpen} onOpenChange={setIsPRDialogOpen} />
    </div>
  );
}
