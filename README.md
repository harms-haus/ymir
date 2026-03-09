# Ymir Window System

A modern, tabbed terminal emulator with split-pane support, workspace management, and AI agent integration.

## Features

### Workspace Management
- **Multiple Workspaces**: Create and switch between up to 8 workspaces (⌘1-8)
- **Persistent Sessions**: Workspace layouts and tab scrollback saved across sessions
- **Notification System**: Real-time notifications from terminal sessions with visual indicators
- **Sidebar Navigation**: Collapsible sidebar showing all workspaces with activity indicators

### Split-Pane Terminal
- **Flexible Splitting**: Split panes horizontally (⌘D) and vertically (⌘⇧D)
- **Resizable Panels**: Drag panel borders to resize panes
- **Independent Panes**: Each pane can have multiple tabs with independent scrollback
- **Focus Tracking**: Click panes to set focus, keyboard shortcuts respect focus state

### Tabbed Interface
- **Multiple Tabs per Pane**: Create unlimited tabs per pane (⌘T)
- **Tab Overflow Handling**: Scrollable tab bar with overflow dropdown
- **Notification Badges**: Visual indicators on tabs with unread notifications
- **Smooth Animations**: Polished transitions for all UI interactions

### Keyboard Shortcuts
All shortcuts use Cmd (Mac) or Ctrl (Windows/Linux):

| Shortcut | Action |
|----------|--------|
| ⌘1-8 | Switch to workspace (1-8) |
| ⌘D | Split active pane horizontally (right) |
| ⌘⇧D | Split active pane vertically (down) |
| ⌘T | Create new tab in active pane |
| ⌘W | Close active tab |
| ⌘⇧W | Close active pane |
| ⌘B | Toggle sidebar |
| ⌘I | Toggle notification panel |
| ⌘⇧U | Jump to first unread notification |

### Notification System
- **Real-time Notifications**: OSC 9, OSC 99, and OSC 777 protocol support
- **Notification Panel**: Slide-in panel showing all unread notifications
- **Jump to Source**: Click notification to navigate to workspace, pane, and tab
- **Clear All**: Bulk dismiss notifications from panel
- **Visual Indicators**: 
  - Blue glow ring on panes with notifications
  - Bell icon with badge on sidebar
  - Notification count badges on tabs

### Session Persistence
- **Auto-Save**: Workspace layouts and scrollback saved automatically
- **Scrollback Preservation**: Last 1000 lines per tab retained
- **Layout Restoration**: Panel sizes and split structure restored on reload
- **State Truncation**: PTY sessions reset (processes cannot persist)

## CLI API for AI Agents

Ymir exposes a CLI API on `window.ymir` for AI agent integration:

### Setup

```typescript
// In main.tsx or App.tsx
import { initCLI } from './cli/commands';
initCLI();
```

### Available Commands

```typescript
// Split active pane in specified direction
window.ymir.split('right')   // Split horizontally
window.ymir.split('down')    // Split vertically

// Navigate focus (placeholder for future implementation)
window.ymir.focus('left')     // Deferred to future phase

// Create new tab in active pane
window.ymir.newTab()          // In current directory
window.ymir.newTab('/home/user')  // With custom working directory

// Close active tab in active pane
window.ymir.closeTab()

// Close active pane
window.ymir.closePane()

// Mark active tab as notified
window.ymir.notify('Build complete')
```

### Type Safety

```typescript
interface YmirCLI {
  split: (direction: 'left' | 'right' | 'up' | 'down') => void;
  focus: (direction: 'left' | 'right' | 'up' | 'down') => void;
  newTab: (cwd?: string) => void;
  closeTab: () => void;
  closePane: () => void;
  notify: (message: string) => void;
}

declare global {
  interface Window {
    ymir: YmirCLI;
  }
}
```

## Logging

Ymir uses structured logging with automatic redaction of sensitive data.

### Configuration

Set log levels via environment variables:

- **Frontend**: `VITE_LOG_LEVEL` (default: `WARN`)
- **Backend**: `RUST_LOG` (default: `warn`)

```bash
# Development - enable debug logging
VITE_LOG_LEVEL=DEBUG npm run dev

# Production - enable temporary debug logging
VITE_LOG_LEVEL=DEBUG npm run build
```

### Log Levels

Use these levels appropriately:

- **DEBUG**: Detailed diagnostic information for development
- **INFO**: General informational messages about normal operation
- **WARN**: Unexpected but recoverable situations
- **ERROR**: Error events that might still allow the application to continue

### Usage Examples

```typescript
import logger from './lib/logger';
import { createLogContext } from './lib/logger-config';

// Info logging with context
logger.info('Operation completed', {
  workspaceId: 'ws-123',
  paneId: 'pane-456',
  action: 'split'
});

// Error logging with details
try {
  await spawnPTY(config);
} catch (e) {
  logger.error('Failed to spawn PTY', {
    error: e.message,
    ...createLogContext('Terminal', { paneId })
  });
}

// Debug logging for development
logger.debug('State updated', {
  component: 'WorkspaceStore',
  action: 'splitPane',
  direction
});
```

### Security

Sensitive data is automatically redacted from logs. The following field patterns trigger redaction:

- `password`, `token`, `secret`
- `apiKey`, `api_key`, `authorization`
- `credential`, `privateKey`, `private_key`
- `sessionId`

These values are replaced with `[REDACTED]` in all log output.

### Production Debugging

To enable debug logging in production:

1. Set `VITE_LOG_LEVEL=DEBUG` before building
2. Build the application
3. Logs will appear in the browser console

Remember to rebuild with `VITE_LOG_LEVEL=WARN` or `ERROR` for production deployments.

## Architecture

### Component Hierarchy

```
Layout (root)
├─ WorkspaceSidebar
│  ├─ Notification Bell
│  ├─ Workspace List (1-8)
│  └─ New Workspace Button
├─ Workspace Content
│  ├─ SplitPane (recursive)
│  │  ├─ PanelGroup (react-resizable-panels)
│  │  │  ├─ PanelResizeHandle
│  │  │  └─ Panel
│  │  │     ├─ Pane (container)
│  │  │     │  ├─ TabBar
│  │  │     │  │  ├─ Tab Items (scrollable)
│  │  │     │  │  ├─ Overflow Dropdown
│  │  │     │  │  └─ New Tab Button
│  │  │     │  └─ Terminal (PTY session)
│  │  │     └─ (recursive SplitPane for branches)
└─ NotificationPanel
   ├─ Header (count + jump button)
   ├─ Notification List
   └─ Footer (clear all button)
```

### State Architecture

```
Zustand Store (workspace.ts)
├─ Workspaces: Workspace[]
│  ├─ id: string
│  ├─ name: string
│  ├─ root: SplitNode (tree)
│  └─ panes: Record<string, Pane>
│     ├─ id: string
│     ├─ tabs: Tab[]
│     ├─ activeTabId: string | null
│     ├─ flexRatio: number (0-1)
│     └─ hasNotification: boolean (derived)
│        └─ Tab
│           ├─ id: string
│           ├─ scrollback: ScrollbackLine[]
│           ├─ hasNotification: boolean
│           └─ notificationText?: string
├─ activeWorkspaceId: string | null
├─ activePaneId: string | null
├─ sidebarCollapsed: boolean
├─ notificationPanelOpen: boolean
└─ Actions (Immer middleware)
   ├─ createWorkspace, closeWorkspace
   ├─ setActiveWorkspace
   ├─ splitPane, closePane, setActivePane
   ├─ createTab, closeTab, setActiveTab
   ├─ markNotification, clearNotification
   └─ toggleSidebar, toggleNotificationPanel
```

### Type System

```
SplitNode (discriminated union)
├─ BranchNode
│  ├─ type: 'branch'
│  ├─ axis: 'horizontal' | 'vertical'
│  └─ children: [SplitNode, SplitNode] (exactly 2)
└─ LeafNode
   ├─ type: 'leaf'
   └─ paneId: string

Constants:
├─ MAX_PANES = 20
├─ MAX_SCROLLBACK_LINES = 1000
└─ MAX_SCROLLBACK_BYTES = 100KB
```

### Integration Points

```
React Components
├─ useLayout Hook
│  └─ Returns: workspace, activePane, activeTab, paneRatio management
├─ useKeyboardShortcuts Hook
│  └─ Sets up global keydown listeners
└─ useDebouncedResize Hook
   └─ Debounces PTY resize events (100ms)

Zustand Store
├─ Actions: Split pane, create/close tabs, workspace management
├─ Getters: activeWorkspace, activePane, paneCount, hasNotifications
├─ Middleware:
│  ├─ Immer (immutable mutations via draft state)
│  ├─ Persist (Tauri storage adapter for session persistence)
│  └─ DevTools (Redux DevTools integration)
└─ CLI Exports: useWorkspaceStore.getState() for non-React code

Tauri Commands (Rust backend)
├─ create_pane_in_workspace(workspace_id, pane_id)
├─ close_pane(workspace_id, pane_id)
├─ focus_pane(workspace_id, pane_id)
├─ get_pane_cwd(workspace_id, pane_id)
├─ set_environment_context(workspace_id, pane_id)
├─ spawn_pty, write_pty, resize_pty, kill_pty
└─ OSC Notification Parsing (9, 99, 777)

react-resizable-panels
├─ PanelGroup (container for resizable panels)
├─ Panel (individual pane with size constraints)
├─ PanelResizeHandle (draggable divider)
└─ onLayout callback (returns panel sizes array)
```

## Development

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite
- **State Management**: Zustand + Immer
- **UI Library**: react-resizable-panels
- **Backend**: Tauri (Rust) for PTY and storage
- **Storage**: Zustand Persist Middleware with Tauri storage adapter

### Project Structure
```
src/
├── components/
│   ├── WorkspaceSidebar.tsx
│   ├── SplitPane.tsx
│   ├── Pane.tsx
│   ├── TabBar.tsx
│   ├── Terminal.tsx
│   └── NotificationPanel.tsx
├── hooks/
│   ├── useLayout.ts
│   ├── useKeyboardShortcuts.ts
│   └── useDebouncedResize.ts
├── state/
│   ├── types.ts
│   └── workspace.ts
├── cli/
│   └── commands.ts
├── Layout.tsx
└── main.tsx
```

### Build Commands
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Type checking
npx tsc --noEmit

# Build production bundle
npm run build
```

## License

MIT
