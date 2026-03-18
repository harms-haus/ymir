import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const ProjectSkeleton: React.FC = () => {
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <Skeleton width="70px" height="28px" variant="rectangular" />
        <Skeleton width="70px" height="28px" variant="rectangular" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
        <Skeleton width="60px" height="28px" variant="rectangular" />
        <Skeleton width="60px" height="28px" variant="rectangular" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="80%" height="14px" variant="text" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="75%" height="14px" variant="text" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="82%" height="14px" variant="text" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="78%" height="14px" variant="text" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="85%" height="14px" variant="text" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Skeleton width="16px" height="16px" variant="circular" />
          <Skeleton width="70%" height="14px" variant="text" />
        </div>
      </div>
    </div>
  );
};
