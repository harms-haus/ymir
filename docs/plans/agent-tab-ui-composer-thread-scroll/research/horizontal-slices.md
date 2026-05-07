# Horizontal Slices: Agent Tab UI – Consistency Patterns

## Layer: Component Structure

### Pattern: Agent Chat Components
Both `AcpChat.tsx` and `AgentChat.tsx` follow this pattern:
1. Read thread state from Zustand store (`useStore`)
2. Wrap in `AgentRuntimeProvider` (bridges to @assistant-ui/react)
3. Use `ThreadPrimitive.Root > Viewport > Messages + ViewportFooter`
4. Differentiate messages by `message.role`
5. Place composer in `ViewportFooter`

**Convention:** Components export named functions (not default exports). Props interfaces are defined inline above the component.

### Pattern: CSS Files
- Component-specific CSS imported at top of component file (e.g., `import './acp-chat.css'`)
- Global styles in `styles/` directory (agent.css, terminal.css, panels.css, theme.css)
- CSS uses `hsl(var(--...))` for colors (shadcn/ui pattern)
- Class names use BEM-ish naming: `.acp-composer-root`, `.acp-composer-input`, `.acp-message-row.user`
- The `assistant-demo-*` prefix in agent.css follows a different convention (feature-prefix)

### Pattern: Agent CSS Layout
```css
.agent-panel-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-width: 0;
  width: 100%;
}
```
This is the container pattern for tab content. Chat components must fill this with `height: 100%`.

## Layer: State Management

### Pattern: Zustand Store Selectors
```tsx
const thread = useStore((state) => state.acpAccumulator.threads.get(threadId));
```
- Direct anonymous selectors are used (no memoized selectors for simple Map lookups)
- For derived data, `useMemo` is used inside components

### Pattern: Accumulator → Runtime Bridge
- `AgentRuntimeProvider` converts `AccumulatedMessage[]` to `ThreadMessageLike[]`
- Uses `convertAccumulatedMessage` function for mapping
- Runtime is created with `useExternalStoreRuntime({ messages, isRunning, onNew, onCancel, convertMessage })`

## Layer: Styling Conventions

### Color Tokens (theme.css)
```
--background, --foreground, --card, --primary, --secondary, --muted,
--muted-foreground, --accent, --border, --ring, --destructive
```
All use HSL values without the `hsl()` wrapper. Usage: `hsl(var(--primary))` or `hsl(var(--primary) / 0.5)` for opacity.

### Spacing
- Uses Tailwind-ish spacing: `0.25rem`, `0.375rem`, `0.5rem`, `0.75rem`, `1rem`
- Font sizes: `0.6875rem` (tiny labels), `0.75rem` (small), `0.8125rem` (body small), `0.875rem` (body), `1rem` (headings)
- Border radius: `0.25rem` (subtle), `0.375rem` (small), `0.5rem` (medium), `1rem` (large/bubble)

### Message Bubble Pattern
User messages: `border-radius: 1rem 1rem 0.25rem 1rem; background: hsl(var(--primary) / 0.42)`
Agent messages: `background: transparent` (no bubble, on-surface)
This matches the PROMPT.md requirements.

## Layer: Scrollbar Pattern

### Global Scrollbar (theme.css)
```css
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent;
}
*::-webkit-scrollbar { width: 3px; height: 3px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.28); border-radius: 999px; }
```

This already provides:
- 3px width ✓
- No track (transparent) ✓
- Rounded top and bottom (border-radius: 999px) ✓
- Consistent with dark theme ✓

Missing: fade-on-idle behavior. A CSS-only approach could use:
```css
.thread-viewport {
  scrollbar-color: transparent transparent;
}
.thread-viewport:hover,
.thread-viewport:active {
  scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent;
}
```
But the PROMPT specifies 5 seconds, which requires JS. A `useScrollbarFade` hook would be the pattern.

## Layer: Error Handling
- Components use null-safe patterns: `thread?.messages ?? []`, `thread?.isStreaming ?? false`
- Empty states render fallback UI ("Waiting for agent session...", "No messages yet")
- No error boundaries at the component level
