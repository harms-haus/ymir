# Task 32: WebSocket Reconnect + State Replay - Learnings

## Implementation Summary

### Exponential Backoff with Jitter
- Backoff sequence: 1s → 2s → 4s → 8s → 16s → 30s (cap)
- Jitter: ±20% of base delay to prevent thundering herd
- Formula: `baseDelay + (Math.random() * 2 - 1) * (baseDelay * 0.2)`

### State Replay on Reconnect
- Send `GetState` message immediately after connection
- Handle `StateSnapshot` response by calling `store.stateFromSnapshot()`
- Replaces entire store state with server snapshot

### Message Queue
- Messages sent during disconnect are queued in `pendingMessages: ClientMessage[]`
- Queue is flushed on successful reconnect
- Messages are sent in order they were queued

### Toast Notification
- Uses `useToastStore.getState().addNotification()` for success toast
- Shows "Reconnected" message on successful reconnect
- Only shows on reconnection, not initial connection

### Clean Disconnect
- `disconnect()` method accepts optional close code parameter (default 1000)
- Called on `beforeunload` with code 1000 for clean close

## Key Files Modified
- `apps/web/src/lib/ws.ts` - Enhanced reconnection logic
- `apps/web/src/lib/__tests__/ws.test.ts` - Comprehensive unit tests

## Test Coverage
- Exponential backoff sequence verification
- Jitter range testing (±20%)
- Message queue flush on reconnect
- State snapshot handling
- Toast notification on reconnect
- Close code 1000 on disconnect
