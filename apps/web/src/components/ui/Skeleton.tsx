/**
 * Skeleton Loading Component
 * Base component for shimmer loading states
 */

import React from 'react';

export interface SkeletonProps {
  width?: string;
  height?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1em',
  variant = 'text',
  className = '',
}) => {
  const baseStyles: React.CSSProperties = {
    width,
    height,
    background: 'linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted) / 0.6) 50%, hsl(var(--muted)) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '0',
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={baseStyles}
      aria-hidden="true"
    />
  );
};

export default Skeleton;
