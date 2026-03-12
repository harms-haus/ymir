// ResizableSidebar wraps WorkspaceSidebar with drag-to-resize functionality
// Uses custom resize implementation for pixel-perfect control

import { useState, useCallback, useEffect, useRef } from 'react';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import useWorkspaceStore from '../state/workspace';

// ============================================================================
// Constants
// ============================================================================

/** Sidebar width constraints in pixels */
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 250;

/** Resize handle dimensions */
const RESIZE_HANDLE_WIDTH = 6;

// ============================================================================
// ResizableSidebar Component
// ============================================================================

/**
 * ResizableSidebar provides resize capability to the WorkspaceSidebar
 * via a draggable handle on the right edge.
 *
 * Constraints:
 * - Minimum width: 200px (when expanded)
 * - Maximum width: 500px
 * - Default width: 250px
 * - Collapsed width: 50px (managed by WorkspaceSidebar state)
 *
 * Resize handle:
 * - 4px wide
 * - Color: var(--border-tertiary) (default), hsl(var(--primary)) (hover/active)
 */
export function ResizableSidebar() {
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const delta = e.clientX - startXRef.current;
    const newWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(SIDEBAR_MAX_WIDTH, startWidthRef.current + delta)
    );
    setWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // When collapsed, let WorkspaceSidebar handle its own width (50px)
  const currentWidth = sidebarCollapsed ? undefined : width;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar Container */}
      <div
        style={{
          width: currentWidth,
          height: '100%',
          overflow: 'hidden',
          flexShrink: 0,
          ...(sidebarCollapsed ? {} : { minWidth: SIDEBAR_MIN_WIDTH }),
        }}
      >
        <WorkspaceSidebar />
      </div>

      {/* Resize Handle - only visible when expanded */}
      {!sidebarCollapsed && (
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: `${RESIZE_HANDLE_WIDTH}px`,
          height: '100%',
          backgroundColor: isResizing ? 'hsl(var(--primary))' : 'var(--background-tertiary)',
          cursor: 'col-resize',
          transition: isResizing ? 'none' : 'background-color 0.15s ease',
          flexShrink: 0,
          userSelect: 'none',
        }}
        onMouseEnter={(e: React.MouseEvent) => {
          if (!isResizing) {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--border-dark)';
          }
        }}
        onMouseLeave={(e: React.MouseEvent) => {
          if (!isResizing) {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--background-tertiary)';
          }
        }}
      />
      )}
    </div>
  );
}

export default ResizableSidebar;
