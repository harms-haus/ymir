# Task 34: Status Bar Learnings


## Implementation Notes

### Component Structure
- StatusBar renders a single-row container at 24px height
- Left-aligned connection indicator only (minimal design)
- Uses inline styles for all visual properties
- Subscribes to `connectionStatus` from Zustand store via `useStore((state) => state.connectionStatus)`

### Connection Status States
Four states with distinct visual indicators:
1. **'open'** → Green dot (● `--status-working`) + "Online" text
2. **'closed'** → Gray dot (● `--status-idle`) + "Offline" text
3. **'connecting'** → Amber spinning dot (⟳ `--status-waiting`) + "Connecting..." text
4. **'reconnecting'** → Amber spinning dot (⟳ `--status-waiting`) + "Reconnecting..." text

### CSS Variables Used
- `--muted` - Background color
- `--border` - Border color
- `--status-working` - Green (online)
- `--status-idle` - Gray (offline)
- `--status-waiting` - Amber (connecting/reconnecting)
- `--muted-foreground` - Text color

### Animation
Added `@keyframes spin` animation to theme.css for rotating ⟳ icon in connecting/reconnecting states
- Animation: `spin 1s linear infinite`
- Only applied when `connectionStatus === 'connecting' || connectionStatus === 'reconnecting'`

### Testing Pattern
When mocking Zustand store selectors, must use `mockImplementation((selector) => selector(state))` instead of `mockReturnValue(state)` because:
- `useStore` expects a selector function that extracts data from state
- Mock implementation must call the selector with the state object
- Component calls: `useStore((state) => state.connectionStatus)`

### Test Selectors
Use `screen.getByText()` for unique text elements (icons, status text) instead of complex DOM query selectors
- More reliable and readable
- Handles inline React rendering better
- Icon characters (●, ⟳) are unique identifiers

### Minimal Design
Per requirements, status bar contains ONLY:
- Connection status indicator (icon + text)
- No git branch, agent count, file changes, or workspace name
- Not interactive (no click handlers)
