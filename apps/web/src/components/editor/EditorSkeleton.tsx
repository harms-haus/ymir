import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export const EditorSkeleton: React.FC = () => {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: '30px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
        <Skeleton width="100%" height="14px" variant="text" />
      </div>
      <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Skeleton width="75%" height="14px" variant="text" />
        <Skeleton width="90%" height="14px" variant="text" />
        <Skeleton width="65%" height="14px" variant="text" />
        <Skeleton width="82%" height="14px" variant="text" />
        <Skeleton width="78%" height="14px" variant="text" />
        <Skeleton width="70%" height="14px" variant="text" />
        <Skeleton width="85%" height="14px" variant="text" />
        <Skeleton width="68%" height="14px" variant="text" />
        <Skeleton width="92%" height="14px" variant="text" />
        <Skeleton width="72%" height="14px" variant="text" />
        <Skeleton width="80%" height="14px" variant="text" />
        <Skeleton width="75%" height="14px" variant="text" />
        <Skeleton width="88%" height="14px" variant="text" />
        <Skeleton width="65%" height="14px" variant="text" />
        <Skeleton width="95%" height="14px" variant="text" />
      </div>
    </div>
  );
};
