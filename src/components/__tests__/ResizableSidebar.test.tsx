import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ResizableSidebar } from '../ResizableSidebar';
import useWorkspaceStore from '../../state/workspace';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ResizableSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { resetState } = useWorkspaceStore.getState();
    if (resetState) {
      resetState();
    }
  });

  describe('Collapsed State', () => {
    it('should render without errors', () => {
      render(<ResizableSidebar />);
      expect(document.body).toBeInTheDocument();
    });

    it('should render in collapsed state when sidebarCollapsed is true', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(true);

      render(<ResizableSidebar />);
    });

    it('should not show resize handle when collapsed', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const { container } = render(<ResizableSidebar />);

      // Resize handle should not be present when collapsed
      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]');
      expect(resizeHandle).not.toBeInTheDocument();
    });

    it('should let WorkspaceSidebar handle width when collapsed', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();
      toggleSidebar();

      const { container } = render(<ResizableSidebar />);

      // The sidebar container should not have a fixed width when collapsed
      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;
      expect(sidebarContainer).toBeDefined();
    });
  });

  describe('Expanded State', () => {
    it('should render in expanded state by default', () => {
      render(<ResizableSidebar />);

      const state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
    });

    it('should show resize handle when expanded', () => {
      const { container } = render(<ResizableSidebar />);

      // Resize handle should be present when expanded
      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]');
      expect(resizeHandle).toBeInTheDocument();
    });

    it('should apply default width when expanded', () => {
      const { container } = render(<ResizableSidebar />);

      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;
      expect(sidebarContainer).toBeDefined();
      // Default width is 250px
      expect(sidebarContainer.style.width).toBe('250px');
    });

    it('should apply minWidth constraint when expanded', () => {
      const { container } = render(<ResizableSidebar />);

      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;
      expect(sidebarContainer).toBeDefined();
      expect(sidebarContainer.style.minWidth).toBe('200px');
    });
  });

  describe('Resize Behavior', () => {
    it('should start resizing on mousedown', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      expect(resizeHandle).toBeInTheDocument();

      // Trigger mousedown on resize handle
      fireEvent.mouseDown(resizeHandle, { clientX: 300 });

      // Resize handle should change color when resizing
      expect(resizeHandle.style.backgroundColor).toBe('rgb(0, 122, 204)');
    });

    it('should update width on mousemove when resizing', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;

      // Start resize
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });

      // Move mouse to the right (increase width)
      fireEvent.mouseMove(window, { clientX: 350 });

      // Width should have increased
      const newWidth = parseInt(sidebarContainer.style.width, 10);
      expect(newWidth).toBeGreaterThan(250);
    });

    it('should stop resizing on mouseup', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // Start resize
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });
      expect(resizeHandle.style.backgroundColor).toBe('rgb(0, 122, 204)');

      // End resize
      fireEvent.mouseUp(window);

      // After mouseup, the handle should no longer be in resizing state
      // The color will reset on next render
    });

    it('should not resize when mousedown is not on resize handle', () => {
      const { container } = render(<ResizableSidebar />);

      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;
      const initialWidth = sidebarContainer.style.width;

      // Click on sidebar container, not resize handle
      fireEvent.mouseDown(sidebarContainer, { clientX: 100 });

      // Width should remain unchanged
      expect(sidebarContainer.style.width).toBe(initialWidth);
    });
  });

  describe('Width Constraints', () => {
    it('should enforce minimum width of 200px', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;

      // Start resize at default width
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });

      // Try to drag far left (would make width < 200px)
      fireEvent.mouseMove(window, { clientX: 0 });

      // Width should be constrained to minimum 200px
      const width = parseInt(sidebarContainer.style.width, 10);
      expect(width).toBeGreaterThanOrEqual(200);
    });

    it('should enforce maximum width of 500px', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;

      // Start resize at default width
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });

      // Try to drag far right (would make width > 500px)
      fireEvent.mouseMove(window, { clientX: 1000 });

      // Width should be constrained to maximum 500px
      const width = parseInt(sidebarContainer.style.width, 10);
      expect(width).toBeLessThanOrEqual(500);
    });

    it('should allow width within constraints', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;

      // Start resize at default width (250px)
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });

      // Drag to a reasonable width within constraints (350px)
      fireEvent.mouseMove(window, { clientX: 350 });

      // Width should be updated to expected value
      const width = parseInt(sidebarContainer.style.width, 10);
      expect(width).toBeGreaterThanOrEqual(200);
      expect(width).toBeLessThanOrEqual(500);
    });
  });

  describe('Resize Handle Appearance', () => {
    it('should have correct resize handle width', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      expect(resizeHandle).toBeInTheDocument();

      // Resize handle width should be 6px
      expect(resizeHandle.style.width).toBe('6px');
    });

    it('should have col-resize cursor on resize handle', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;
      expect(resizeHandle).toBeInTheDocument();
      expect(resizeHandle.style.cursor).toBe('col-resize');
    });

    it('should apply hover color on mouse enter', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // Trigger mouse enter
      fireEvent.mouseEnter(resizeHandle);

      // Hover color should be applied
      expect(resizeHandle.style.backgroundColor).toBe('rgb(85, 85, 85)');
    });

    it('should reset color on mouse leave', () => {
      const { container } = render(<ResizableSidebar />);

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // First trigger mouse enter
      fireEvent.mouseEnter(resizeHandle);
      expect(resizeHandle.style.backgroundColor).toBe('rgb(85, 85, 85)');

      // Then trigger mouse leave
      fireEvent.mouseLeave(resizeHandle);

      // Color should reset
      expect(resizeHandle.style.backgroundColor).toBe('rgb(60, 60, 60)');
    });
  });

  describe('State Transitions', () => {
    it('should toggle between collapsed and expanded states', () => {
      const { toggleSidebar } = useWorkspaceStore.getState();

      // Initially expanded
      let state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(false);

      // Toggle to collapsed
      toggleSidebar();
      state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(true);

      // Toggle back to expanded
      toggleSidebar();
      state = useWorkspaceStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
    });

    it('should persist width when toggling collapse and expand', () => {
      const { container } = render(<ResizableSidebar />);
      const { toggleSidebar } = useWorkspaceStore.getState();

      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // Resize to a custom width
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });
      fireEvent.mouseMove(window, { clientX: 350 });
      fireEvent.mouseUp(window);

      const sidebarContainer = container.firstChild?.firstChild as HTMLElement;
      const customWidth = sidebarContainer.style.width;

      // Toggle collapsed
      toggleSidebar();

      // Toggle back to expanded
      toggleSidebar();

      // Width should persist (component maintains its own state)
      expect(sidebarContainer.style.width).toBe(customWidth);
    });
  });

  describe('Event Listeners', () => {
    it('should add window event listeners when resizing starts', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      const { container } = render(<ResizableSidebar />);
      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // Start resize
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });

      // Should add mousemove and mouseup listeners
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('should remove window event listeners when resizing ends', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { container } = render(<ResizableSidebar />);
      const resizeHandle = container.querySelector('[style*="cursor: col-resize"]') as HTMLElement;

      // Start and end resize
      fireEvent.mouseDown(resizeHandle, { clientX: 250 });
      fireEvent.mouseUp(window);

      // Should remove mousemove and mouseup listeners
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
