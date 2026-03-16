# Draft: Ymir Worktree/Agent Orchestrator - FINAL DECISIONS

## All Decisions Confirmed

### Tech Stack
- **Binary Protocol**: MessagePack over WebSocket
- **State Management**: Server-authoritative with optimistic UI
- **Diff/Editor**: Monaco for editing (via WebSocket for file content), react-diff-viewer for diffs
- **PTY Sessions**: Always active (hybrid: active workspaces always on, inactive suspended after timeout)
- **Agent Protocol**: Agent Client Protocol (ACP) - JSON-RPC over stdio
- **Agent Detection**: ACP session/update notifications for status
- **File Browser**: Custom implementation with virtual scrolling (react-window)
- **Git Operations**: Rust git2 crate
- **Security**: Local only (no auth MVP)
- **Workspaces**: Single-repo with many worktrees (default: .worktrees/work-tree-name)
- **Styling**: Tailwind + Base UI + shadcn preset --preset auHhe6q
- **Icons**: Remix Icon
- **Resizing**: react-resizable-panels
- **Error Recovery**: Auto-reconnect for all (exponential backoff)
- **Persistence**: Turso (libSQL)
- **Conflict Resolution**: Server always wins

### ACP Details
- Transport: JSON-RPC over stdio (agent as subprocess)
- Flow: initialize → session/new (cwd) → session/prompt → session/update (streamed)
- Status: plan entries pending/working, tool_call pending/in_progress, request_permission=waiting
- Supported agents: Claude, Codex CLI, Cursor, Gemini CLI, OpenCode, Pi, and 25+ more

### Performance Limits
- Max files in tree: 10,000 (virtual scroll)
- Max file size for Monaco: 5MB
- Max worktrees per workspace: 50
- Terminal scrollback: 10,000 lines
- Max concurrent agents: 10
- Max concurrent terminals: 20

### UI Decisions
- Workspace headers: Rich with Remix Icon + name + status summary
- Status dots: Animated (pulsing=waiting, flashing=working) + tooltips
- Agent pane: No branding, tabs above, closable with ghost X + middle-click
- Terminal: Tabs above, "Terminal 1,2..." labeling, + button
- Resize handles: Thin gray with grab indicator, min width
- File tree: Collapsible, top open by default, state stored per worktree
- Changes: Colored dots (green/yellow/red), toggleable flat/grouped
- Click change → diff tab, Click file → editor tab
- PR/Merge buttons in Changes toolbar, full dialog flows
- Status bar: Connection only
- Keyboard shortcuts: None (excluded from scope)
- Testing: TDD unit tests only, no integration tests

### Must NOT Have
Multi-user, remote access, AI beyond spawning, undo/redo, custom themes, plugins, mobile, cloud sync, binary diffs, rebase UI, terminal customization, Monaco extensions, repos >1GB, keyboard shortcuts, offline mode, integration tests
