// Workspace/Pane/Tab hierarchy types for Ymir window system
// Based on Warp tree pattern with discriminated unions

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of panes allowed across all workspaces */
export const MAX_PANES = 20;

/** Minimum font size for terminal */
export const MIN_FONT_SIZE = 8;

/** Maximum font size for terminal */
export const MAX_FONT_SIZE = 32;

/** Maximum scrollback lines per tab (for persistence) */
export const MAX_SCROLLBACK_LINES = 1000;

/** Maximum scrollback size per tab in bytes (for persistence) */
export const MAX_SCROLLBACK_BYTES = 100 * 1024; // 100KB

// ============================================================================
// Direction Types
// ============================================================================

/** Split direction for pane operations */
export type SplitDirection = 'left' | 'right' | 'up' | 'down';

/** Axis orientation for split groups */
export type SplitAxis = 'horizontal' | 'vertical';

// ============================================================================
// Scrollback Types
// ============================================================================

/** Single line in terminal scrollback */
export interface ScrollbackLine {
  /** Raw text content of the line */
  text: string;
  /** ANSI escape codes for styling (optional) */
  ansi?: string;
  /** Timestamp when line was received */
  timestamp?: number;
}

// ============================================================================
// Tab Types
// ============================================================================

/** Terminal tab with scrollback and notification state */
export interface Tab {
  /** Unique identifier for this tab */
  id: string;
  /** Display title (usually shell name or cwd basename) */
  title: string;
  /** Current working directory */
  cwd: string;
  /** PTY session identifier (from Tauri) */
  sessionId: string;
  /** Optional git branch name */
  gitBranch?: string;
  /** Whether this tab has unread notifications */
  hasNotification: boolean;
  /** Number of unread notifications */
  notificationCount: number;
  /** Most recent notification message */
  notificationText?: string;
  /** Terminal scrollback history (circular buffer) */
  scrollback: ScrollbackLine[];
}

// ============================================================================
// Pane Types
// ============================================================================

/** Pane (split window) containing multiple tabs */
export interface Pane {
  /** Unique identifier for this pane */
  id: string;
  /** Flex ratio for this pane (0-1, relative to siblings) */
  flexRatio: number;
  /** Array of tabs in this pane */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTabId: string | null;
  /** Whether this pane has notifications (from any tab) */
  hasNotification: boolean;
}

// ============================================================================
// Split Tree Types (Discriminated Union)
// ============================================================================

/** Branch node: contains split children */
export interface BranchNode {
  /** Discriminant for type narrowing */
  type: 'branch';
  /** Unique identifier for this branch node */
  id: string;
  /** Axis orientation for this split */
  axis: SplitAxis;
  /** Child nodes (must be exactly 2: left/top and right/bottom) */
  children: [SplitNode, SplitNode];
}

/** Leaf node: references a pane */
export interface LeafNode {
  /** Discriminant for type narrowing */
  type: 'leaf';
  /** Reference to pane containing terminal tabs */
  paneId: string;
}

/** Union type for split tree nodes (discriminated by 'type' field) */
export type SplitNode = BranchNode | LeafNode;

// ============================================================================
// Workspace Types
// ============================================================================

/** Workspace containing a tree of panes */
export interface Workspace {
  /** Unique identifier for this workspace */
  id: string;
  /** Display name (e.g., "Workspace 1") */
  name: string;
  /** Root split node (tree of panes) */
  root: SplitNode;
  /** Currently active pane ID */
  activePaneId: string | null;
  /** Notification state for this workspace */
  hasNotification: boolean;
}

// ============================================================================
// Sidebar Panel Types
// ============================================================================

/** Available sidebar tabs/panels */
export type SidebarTab = 'workspaces' | 'notifications' | 'git' | 'project';

/** Tab badge configuration */
export interface TabBadge {
  /** Number to display on badge (e.g., notification count) */
  count?: number;
  /** Icon to display on badge (optional) */
  icon?: string;
  /** Badge color (CSS color string) */
  color?: string;
}

/** Panel definition with render handlers for reactivity */
export interface PanelDefinition {
  /** Unique identifier matching SidebarTab type */
  id: SidebarTab;
  /** Hover text shown on tab */
  title: string;
  /** Tab icon renderer (reactive) */
  icon: () => React.ReactNode;
  /** Tab badge renderer (optional, reactive) */
  badge?: () => TabBadge | null;
  /** Full panel content when sidebar expanded */
  fullRender: () => React.ReactNode;
  /** Content when sidebar collapsed (optional) */
  collapsedRender?: () => React.ReactNode | null;
}


// ============================================================================
// Helper Types
// ============================================================================

/** Complete pane tree layout snapshot for persistence */
export interface LayoutSnapshot {
  /** All workspaces in this layout */
  workspaces: Workspace[];
  /** Currently active workspace ID */
  activeWorkspaceId: string;
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;
}

/** Size information from react-resizable-panels onLayout callback */
export interface PanelSize {
  /** Size as percentage (0-100) */
  asPercentage: number;
  /** Size in pixels */
  inPixels: number;
}

/** Resize event data from react-resizable-panels */
export interface ResizeEvent {
  /** New sizes for all panels in the group (percentages) */
  sizes: number[];
  /** Panel group direction */
  direction: 'horizontal' | 'vertical';
}

// ============================================================================
// Utility Types
// ============================================================================

/** Type guard to check if a SplitNode is a Branch */
export function isBranch(node: SplitNode): node is BranchNode {
  return node.type === 'branch';
}

/** Type guard to check if a SplitNode is a Leaf */
export function isLeaf(node: SplitNode): node is LeafNode {
  return node.type === 'leaf';
}

/** Map of pane IDs to Pane objects (for O(1) lookup) */
export type PaneMap = Record<string, Pane>;

/** Map of tab IDs to Tab objects (for O(1) lookup) */
export type TabMap = Record<string, Tab>;

// ============================================================================
// Git State Types
// ============================================================================

/** Status of a file in the git repository */
export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'renamed'
  | 'conflict';

/** Information about a single file in the git repository */
export interface GitFile {
  /** Relative path from repository root */
  path: string;
  /** Current status of the file */
  status: GitFileStatus;
  /** Whether this file is in the staging area */
  staged: boolean;
  /** Original path if file was renamed */
  originalPath?: string;
}

/** Information about a branch */
export interface GitBranch {
  /** Branch name */
  name: string;
  /** Whether this is the current (checked out) branch */
  isCurrent: boolean;
  /** Whether this is a remote branch */
  isRemote: boolean;
  /** Upstream branch name (if any) */
  upstream?: string;
}

/** Complete repository state */
export interface GitRepo {
  /** Repository root path */
  path: string;
  /** Current branch name */
  branch: string;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Files staged for commit */
  staged: GitFile[];
  /** Files with unstaged changes */
  unstaged: GitFile[];
}

/** Git state for multiple repositories */
export type GitState = Record<string, GitRepo>;
