/**
 * Sidebar Skeleton Loading Component
 * Shimmer loading state for sidebar panel
 */

import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const SidebarSkeleton: React.FC = () => {
  return (
    <div
      style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Workspace 1 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="24px" height="24px" variant="circular" />
          <Skeleton width="60%" height="16px" variant="text" />
        </div>
        {/* Worktrees */}
        <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="80%" height="14px" variant="text" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="75%" height="14px" variant="text" />
          </div>
        </div>
      </div>

      {/* Workspace 2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="24px" height="24px" variant="circular" />
          <Skeleton width="55%" height="16px" variant="text" />
        </div>
        {/* Worktrees */}
        <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="70%" height="14px" variant="text" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="65%" height="14px" variant="text" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="72%" height="14px" variant="text" />
          </div>
        </div>
      </div>

      {/* Workspace 3 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="24px" height="24px" variant="circular" />
          <Skeleton width="50%" height="16px" variant="text" />
        </div>
        {/* Worktrees */}
        <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Skeleton width="8px" height="8px" variant="circular" />
            <Skeleton width="85%" height="14px" variant="text" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SidebarSkeleton;
