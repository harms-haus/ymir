// Central constants for workspace management
// Single source of truth for all numeric configuration

/** Maximum number of workspaces allowed */
export const MAX_WORKSPACES = 8;

/** Maximum number of panes allowed across all workspaces */
export const MAX_PANES = 20;

/** Warning threshold for pane count (logs warning when approaching MAX_PANES) */
export const PANE_WARNING_THRESHOLD = 15;

/** Git polling interval in milliseconds */
export const GIT_POLLING_INTERVAL_MS = 5000;

/** Maximum scrollback lines per tab (for persistence) */
export const MAX_SCROLLBACK_LINES = 1000;

/** Maximum scrollback size per tab in bytes (for persistence) */
export const MAX_SCROLLBACK_BYTES = 100 * 1024;

/** Default font size for terminal */
export const DEFAULT_FONT_SIZE = 14;

/** Minimum font size for terminal */
export const MIN_FONT_SIZE = 8;

/** Maximum font size for terminal */
export const MAX_FONT_SIZE = 32;

/** Sidebar minimum width in pixels */
export const SIDEBAR_MIN_WIDTH = 200;

/** Sidebar maximum width in pixels */
export const SIDEBAR_MAX_WIDTH = 500;

/** Sidebar default width in pixels */
export const SIDEBAR_DEFAULT_WIDTH = 250;

/** Resize handle width in pixels */
export const RESIZE_HANDLE_WIDTH = 4;
