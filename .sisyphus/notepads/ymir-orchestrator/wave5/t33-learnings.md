
## T33: Error Recovery - 2026-03-17

**Status:** COMPLETED

### Implementation Summary

Created centralized error handling system for PTY crash, git failure, agent crash, and database errors.

### Files Created/Modified

1. **`apps/web/src/types/protocol.ts`** - Added error types:
   - `ErrorCodes` constant object with `PTY_CRASH`, `GIT_FAILURE`, `AGENT_CRASH`, `DB_ERROR`
   - `PtyCrashError` interface with `sessionId`, `worktreeId`
   - `GitFailureError` interface with `worktreeId`, `operation`, `conflictFiles`
   - `AgentCrashError` interface with `worktreeId`, `agentType`, `sessionId`
   - `DbError` interface with `operation`
   - Type guards: `isPtyCrashError`, `isGitFailureError`, `isAgentCrashError`, `isDbError`

2. **`apps/web/src/lib/error-recovery.ts`** - Created error handling module:
   - `handlePtyCrash()` - Shows toast, sends `TerminalCreate` to restart PTY
   - `handleGitFailure()` - Shows toast with conflict file details
   - `handleAgentCrash()` - Shows toast with agent name
   - `handleDbError()` - Shows toast, opens DB reset dialog via store
   - `handleError()` - Dispatcher that routes to appropriate handler
   - `sendDbReset()` - Sends reset request via WebSocket

3. **`apps/web/src/store.ts`** - Added DB reset dialog state:
   - `dbResetDialog` state with `isOpen`, `errorMessage`
   - `setDbResetDialogOpen()`, `resetDbResetDialog()` actions
   - Selectors: `selectDbResetDialog`, `selectDbResetDialogOpen`
   - Updated `updateStateFromServerMessage()` to use `handleError()`

4. **`apps/web/src/types/state.ts`** - Added types:
   - `DbResetDialogState` interface
   - Actions in `AppState` interface

5. **`apps/web/src/lib/__tests__/error-recovery.test.ts`** - 22 comprehensive tests

### Key Patterns

- **Discriminated union pattern**: Error types use `code` field to distinguish between error categories
- **Type guards**: Used for type-safe error dispatching
- **Store integration**: Dialog state managed via Zustand store for global access
- **Context parameter**: Error handlers accept optional context for additional info (e.g., agent name)

### Testing Strategy

- Mock both `useToastStore` and `useStore` for testing
- Test each handler independently
- Test `handleError` dispatcher routing
- Test conflict file truncation logic
- Test context parameter handling

### Error Handling Flow

```
Server sends Error message
    ↓
updateStateFromServerMessage() in store.ts
    ↓
handleError() in error-recovery.ts
    ↓
Routes to specific handler based on error.code
    ↓
Handler shows toast, triggers recovery actions
```

### PTY Crash Recovery

1. Show toast "Terminal Session Crashed - Restarting..."
2. Send `TerminalCreate` message to server
3. Server creates new PTY session
4. TerminalCreated message updates store

### Git Failure Handling

- Does NOT auto-retry (user must fix manually)
- Shows specific operation in toast title
- Displays conflict files if present (truncated to 3 with "and X more")

### Agent Crash Handling

- Shows agent name in toast
- User can restart from worktree context menu
- Does NOT auto-restart

### Database Error Handling

- Shows persistent toast (duration: 0)
- Opens DB reset dialog
- Reset button sends `UpdateSettings` with `db_reset: true`

### Lessons Learned

1. **Avoid shadowing global `Error`**: Rename import to `ServerError` to avoid LSP errors
2. **Consistent comment style**: Follow existing patterns for section comments in interfaces
3. **Mock all dependencies**: Tests need to mock both toast store and main store when using store actions
