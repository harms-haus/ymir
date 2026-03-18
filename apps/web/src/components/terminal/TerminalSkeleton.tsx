/**
 * Terminal Pane Skeleton Loading Component
 * Shimmer loading state for terminal panel
 */

import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const TerminalSkeleton: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'hsl(var(--terminal-bg, var(--background)))',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px' }}>
        <Skeleton width="80px" height="28px" variant="rectangular" />
      </div>

      {/* Terminal content */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {/* Green-tinted lines to match terminal theme */}
        <Skeleton width="100%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="85%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="90%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="60%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="95%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="70%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="80%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="55%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="75%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="100%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="65%" height="14px" variant="text" className="terminal-skeleton-line" />
        <Skeleton width="88%" height="14px" variant="text" className="terminal-skeleton-line" />
      </div>
    </div>
  );
};

export default TerminalSkeleton;
