# Manual QA Learnings

**Date:** 2026-03-12

## Testing Approach

- Used Chrome DevTools MCP for browser automation
- Tested in browser mode (Vite dev server) rather than Tauri mode
- Limited testing possible due to Tauri-dependent features

## What Works Well

1. **Workspace Management:**
   - Creating new workspaces is smooth
   - Workspace switching is responsive
   - Sidebar UI is clean and functional

2. **Tab Management:**
   - Creating tabs works reliably
   - Closing tabs works correctly
   - Tab bar UI is intuitive

3. **UI Responsiveness:**
   - Interface is snappy
   - No noticeable lag in interactions
   - Visual feedback is clear

## Limitations of Browser Mode

Several features require Tauri backend and cannot be tested in browser mode:
- PTY/Terminal functionality (requires Rust backend)
- Notifications (requires OSC protocol support)
- File system operations
- Platform-specific features

## Keyboard Shortcuts

Keyboard shortcuts are defined in `useKeyboardShortcuts.ts`:
- ⌘1-8: Switch workspace
- ⌘D: Split pane right
- ⌘⇧D: Split pane down
- ⌘T: New tab
- ⌘W: Close tab
- ⌘⇧W: Close pane
- ⌘B: Toggle sidebar
- ⌘I: Toggle notification panel
- ⌘⇧U: Jump to first unread notification

Note: In browser mode on Linux, use Ctrl instead of ⌘

## Architecture Observations

1. **State Management:** Uses Zustand with Immer middleware
2. **Component Structure:** Well-organized with clear separation of concerns
3. **Error Boundaries:** ErrorBoundary component wraps major sections
4. **Theme System:** CSS variables for theming

## Files of Interest

- `src/hooks/useKeyboardShortcuts.ts` - Keyboard shortcut handling
- `src/state/workspace.ts` - Workspace state management
- `src/cli/commands.ts` - CLI API (not initialized)
- `src/components/Layout.tsx` - Main layout component
- `src/components/SplitPane.tsx` - Pane splitting logic
