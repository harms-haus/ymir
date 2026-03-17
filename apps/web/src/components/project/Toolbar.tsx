import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';

interface ToolbarProps {
  onPRClick: () => void;
  canCreatePR: boolean;
}

export function Toolbar({ onPRClick, canCreatePR }: ToolbarProps) {
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        type="button"
        onClick={onPRClick}
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

      <Popover.Root open={isMergeOpen} onOpenChange={setIsMergeOpen}>
        <Popover.Trigger
          render={
            <button
              type="button"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'hsl(var(--success))',
                color: 'hsl(var(--success-foreground))',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="ri-merge-cells-vertical" style={{ fontSize: '14px' }} />
              Merge
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
          }
        />
        
        <Popover.Portal>
          <Popover.Positioner
            style={{
              position: 'absolute',
              zIndex: 9999,
            }}
          >
            <Popover.Popup
              style={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                minWidth: '180px',
                padding: '4px 0',
                marginTop: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  console.log('Merge - no squash');
                  setIsMergeOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                  gap: '8px',
                  border: 'none',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                  background: 'transparent',
                }}
              >
                <i className="ri-merge-cells-vertical" style={{ fontSize: '14px' }} />
                Merge without squash
              </button>
              <button
                type="button"
                onClick={() => {
                  console.log('Merge - squash');
                  setIsMergeOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                  gap: '8px',
                  border: 'none',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                  background: 'transparent',
                }}
              >
                <i className="ri-compress-line" style={{ fontSize: '14px' }} />
                Squash and merge
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}