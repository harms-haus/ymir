# Task 29 Learnings: CreateWorktreeDialog Implementation

## Patterns Used

### Dialog Component Structure
- Base UI Dialog follows pattern: `Dialog.Root` -> `Dialog.Portal` -> `Dialog.Backdrop` + `Dialog.Popup`
- Controlled dialogs use `open` and `onOpenChange` props
- Use inline styles matching existing `CreatePRDialog.tsx` patterns

### RadioGroup Implementation
- Base UI RadioGroup: `RadioGroup` with custom styled `label` elements containing hidden radio inputs
- Use `aria-labelledby` for accessibility when not using a `<label>` element
- Custom radio indicator using CSS (border-radius circle with inner dot)

### Store State Pattern
- Dialog state tracked with `{ isOpen: boolean, workspaceId: string | null }`
- Actions: `setCreateWorktreeDialogOpen(isOpen, workspaceId?)`, `resetCreateWorktreeDialog()`
- Selectors: `selectCreateWorktreeDialog`, `selectCreateWorktreeDialogOpen`

### WebSocket Message Handling
- Use `client.onMessage()` with cleanup refs for async operations
- Clean up subscriptions in `useEffect` return and on unmount
- Set 30-second timeout for operations

### Testing Patterns
- Mock store with `vi.mock('../../../store', ...)`
- Mock WebSocket client with `vi.mock('../../../lib/ws', ...)`
- Use `messageHandlers` Map pattern for simulating WebSocket responses
- `waitFor()` for async assertions

## Gotchas
- RadioGroup controlled/uncontrolled warning: initial value is `null`, but RadioGroup expects `undefined` for uncontrolled
- Tests pass despite TypeScript type errors on jest-dom matchers (existing codebase pattern)
- FormEvent deprecation hint on React 19

## File Locations
- Dialog: `apps/web/src/components/dialogs/CreateWorktreeDialog.tsx`
- Tests: `apps/web/src/components/dialogs/__tests__/CreateWorktreeDialog.test.tsx`
- Store: `apps/web/src/store.ts`
- Types: `apps/web/src/types/state.ts`
- Trigger: `apps/web/src/components/sidebar/WorkspaceTree.tsx`