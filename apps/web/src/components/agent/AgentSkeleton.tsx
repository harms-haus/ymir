/**
 * Agent Pane Skeleton Loading Component
 * Shimmer loading state for agent panel
 */

import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const AgentSkeleton: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <Skeleton width="100px" height="28px" variant="rectangular" />
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          background: 'hsl(var(--muted) / 0.3)',
          borderRadius: '8px',
        }}
      >
        <Skeleton width="90%" height="14px" variant="text" />
        <Skeleton width="75%" height="14px" variant="text" />
        <Skeleton width="85%" height="14px" variant="text" />
        <Skeleton width="50%" height="14px" variant="text" />
        <Skeleton width="60%" height="14px" variant="text" />
      </div>

      {/* Input box */}
      <Skeleton width="100%" height="40px" variant="rectangular" />

      {/* Tip area */}
      <Skeleton width="60%" height="12px" variant="text" />
    </div>
  );
};

export default AgentSkeleton;
