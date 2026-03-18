# Task 30 Learnings: Workspace Settings Dialog

## Patterns Discovered

### Dialog Component Structure
- Use Base UI Dialog with Root, Portal, Backdrop, Popup structure
- Title and Description components are required for accessibility
- Form elements should have proper label associations
- For custom radio buttons (color picker, icon selector), use `role="radiogroup"` and `role="radio"` with `aria-checked` and `aria-labelledby`

### Store Integration
- Dialog state follows the pattern: `{ isOpen: boolean, workspaceId: string | null }`
- Actions: `setDialogOpen(isOpen, id?)` and `resetDialog()`
- Selectors: `selectDialog` and `selectDialogOpen` for easy access

### Context Menu Integration
- Add new action type to `ContextMenuAction` union
- Add callback to `ContextMenuCallbacks` interface
- Update `handleAction` switch statement
- Update ContextMenu visibility logic for workspace vs worktree targets

### WebSocket Message Flow
1. Subscribe to success message (WorkspaceUpdated/WorkspaceDeleted)
2. Subscribe to Error message
3. Set timeout for operation (30s default)
4. Clean up subscriptions on unmount or completion

### Testing Patterns
- Mock store with full AppState shape
- Mock WebSocket client with `send` and `onMessage`
- Use `getAllByRole` when multiple elements have same accessible name
- For async operations, use `waitFor` with message handlers

## Gotchas

### Multiple Cancel Buttons
When confirmation UI is shown within a dialog, there may be multiple Cancel buttons. Use array indexing or more specific selectors.

### Form Label Association
LSP warnings for label associations can be resolved by:
- Using `htmlFor` with `id` on input
- For radio groups, use `role="radiogroup"` with `aria-labelledby` pointing to a label div

### Unused Subscription Variables
When subscribing to messages but not storing the unsubscribe function, don't declare the variable:
```tsx
// Bad - unused variable warning
const unsubscribe = client.onMessage('Error', handler);

// Good - just call the method
client.onMessage('Error', handler);
```

## Files Modified

- `apps/web/src/components/dialogs/WorkspaceSettingsDialog.tsx` (new)
- `apps/web/src/components/dialogs/__tests__/WorkspaceSettingsDialog.test.tsx` (new)
- `apps/web/src/types/state.ts` (added WorkspaceSettingsDialogState)
- `apps/web/src/store.ts` (added state and actions)
- `apps/web/src/hooks/useContextMenu.ts` (added 'settings' action)
- `apps/web/src/components/ui/ContextMenu.tsx` (updated visibility logic)
- `apps/web/src/components/sidebar/WorkspaceTree.tsx` (integrated dialog)