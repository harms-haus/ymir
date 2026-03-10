import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockTab,
  createMockPane,
  createMockWorkspace,
  createMockLeafNode,
  createMockBranchNode,
  resetIdCounter,
} from './factories';

describe('Test Factories', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('createMockTab', () => {
    it('should create a tab with default values', () => {
      const tab = createMockTab();

      expect(tab.id).toBeDefined();
      expect(tab.title).toContain('tab-');
      expect(tab.scrollback).toEqual([]);
      expect(tab.hasNotification).toBe(false);
    });

    it('should create a tab with custom values', () => {
      const tab = createMockTab({
        id: 'custom-tab',
        title: 'Custom Tab',
        hasNotification: true,
      });

      expect(tab.id).toBe('custom-tab');
      expect(tab.title).toBe('Custom Tab');
      expect(tab.hasNotification).toBe(true);
    });

    it('should auto-increment tab ids', () => {
      const tab1 = createMockTab();
      const tab2 = createMockTab();

      expect(tab1.id).not.toBe(tab2.id);
    });
  });

  describe('createMockPane', () => {
    it('should create a pane with default values', () => {
      const pane = createMockPane();

      expect(pane.id).toBeDefined();
      expect(pane.tabs).toHaveLength(1);
      expect(pane.activeTabId).toBeDefined();
      expect(pane.flexRatio).toBe(1);
    });

    it('should create a pane with custom values', () => {
      const pane = createMockPane({
        id: 'custom-pane',
        flexRatio: 2,
      });

      expect(pane.id).toBe('custom-pane');
      expect(pane.flexRatio).toBe(2);
    });

    it('should create a pane with multiple tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Tab 1' });
      const tab2 = createMockTab({ id: 'tab-2', title: 'Tab 2' });
      const pane = createMockPane({
        tabs: [tab1, tab2],
        activeTabId: 'tab-2',
      });

      expect(pane.tabs).toHaveLength(2);
      expect(pane.activeTabId).toBe('tab-2');
    });
  });

  describe('createMockWorkspace', () => {
    it('should create a workspace with default values', () => {
      const workspace = createMockWorkspace();

      expect(workspace.id).toBeDefined();
      expect(workspace.name).toContain('workspace-');
      expect(workspace.root).toBeDefined();
      expect(workspace.activePaneId).toBeDefined();
    });

    it('should create a workspace with custom values', () => {
      const workspace = createMockWorkspace({
        id: 'custom-workspace',
        name: 'Custom Workspace',
      });

      expect(workspace.id).toBe('custom-workspace');
      expect(workspace.name).toBe('Custom Workspace');
    });

    it('should auto-increment workspace ids', () => {
      const workspace1 = createMockWorkspace();
      const workspace2 = createMockWorkspace();

      expect(workspace1.id).not.toBe(workspace2.id);
    });
  });

  describe('createMockLeafNode', () => {
    it('should create a leaf node with paneId', () => {
      const node = createMockLeafNode('pane-123');

      expect(node.type).toBe('leaf');
      expect(node.paneId).toBe('pane-123');
    });

    it('should create unique leaf nodes', () => {
      const node1 = createMockLeafNode('pane-1');
      const node2 = createMockLeafNode('pane-2');

      expect(node1.paneId).toBe('pane-1');
      expect(node2.paneId).toBe('pane-2');
    });
  });

  describe('createMockBranchNode', () => {
    it('should create a horizontal branch node', () => {
      const left = createMockLeafNode('left-pane');
      const right = createMockLeafNode('right-pane');
      const node = createMockBranchNode([left, right], 'horizontal');

      expect(node.type).toBe('branch');
      expect(node.axis).toBe('horizontal');
      expect(node.children).toHaveLength(2);
      expect(node.children[0]).toBe(left);
      expect(node.children[1]).toBe(right);
    });

    it('should create a vertical branch node', () => {
      const top = createMockLeafNode('top-pane');
      const bottom = createMockLeafNode('bottom-pane');
      const node = createMockBranchNode([top, bottom], 'vertical');

      expect(node.type).toBe('branch');
      expect(node.axis).toBe('vertical');
      expect(node.children).toHaveLength(2);
    });
  });

  describe('resetIdCounter', () => {
    it('should reset the ID counter', () => {
      createMockTab();
      createMockTab();
      resetIdCounter();
      const tab = createMockTab();

      expect(tab.id).toContain('tab-1');
    });

    it('should reset workspace counter', () => {
      createMockWorkspace();
      resetIdCounter();
      const workspace = createMockWorkspace();

      expect(workspace.id).toContain('workspace-1');
    });
  });
});
