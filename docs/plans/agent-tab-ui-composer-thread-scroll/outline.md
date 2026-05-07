# Implementation Outline: Agent Tab UI – Composer, Thread, and Scroll Behaviors

## Saga Branch: `feat/agent-tab-ui-chat`

## Summary

Replace the current `AcpChat.tsx` component (which uses `@assistant-ui/react` primitives) with `acp-chat-react` components (`Thread`, `Composer`, `ThoughtStack`, `ToolCall`), wiring them to the already-existing `AcpStore` and `SessionController` instances managed by `acp-session-manager.ts`.

The infrastructure layer (transport, session controller, store) is already built. This saga focuses on the **UI rendering layer**: consuming the store in React components and styling them to match PROMPT.md requirements.

## Key Architectural Insight

The `acp-session-manager.ts` already creates per-agent-tab:
- `YmirAcpTransport` (implements `Transport` interface)
- `SessionController` (from `acp-chat-core`)
- `AcpStore` (from `acp-chat-react`)

And routes `acp_payload` bridge messages through the transport → controller → store pipeline. The AcpStore has live normalized state ready for React consumption. We do NOT need the "store-only mode" or `createStandaloneAcpStore()` mentioned in notes.md — the SessionController-based approach is already functional.

## Scope

### In Scope
1. Replace `AcpChat.tsx` with acp-chat-react `Thread` + `Composer` components
2. Wire `AgentPane.tsx` to pass `AcpStore` and `SessionController` from `acpSessionManager`
3. Custom settings row for Composer (ACP Mode, Model, Session selects)
4. Custom message styling (user bubbles, agent on-surface, tool stacks)
5. Scrollbar fade-on-idle behavior
6. Jump-to-latest button (built into VirtualizedThread)
7. CSS for all the above

### Out of Scope
- Changes to `acp-chat-react` package (all needed features exist)
- Changes to `acp-chat-core` package
- Changes to the Rust WebSocket server
- Deprecation of `AgentRuntimeProvider.tsx` (will keep for backward compat during transition)
- `AgentChat.tsx` (the richer but unused component)

## Implementation Phases

### Phase 1: AcpChat Rewrite (Core Structure)
Replace `AcpChat.tsx` internals with acp-chat-react components. Uses `Thread` with `layout="expanded"`, `Composer` with custom settings row. Gets `AcpStore` + `SessionController` from `acpSessionManager`.

### Phase 2: AgentPane Wiring
Update `AgentPane.tsx` to fetch `AcpStore` and `SessionController` from `acpSessionManager` and pass them as props to the new `AcpChat`. Ensures `acpSessionManager` controllers are created when agent sessions appear.

### Phase 3: Custom Settings Row
Implement `renderSettingsRow` callback for the Composer, displaying ACP Mode/Model/Session selects with Ymir's styling (using `@base-ui/react` Select components).

### Phase 4: Message Styling
Custom CSS for:
- User messages: right-aligned bubble with `border-radius: 1rem 1rem 0.25rem 1rem; background: hsl(var(--primary) / 0.42)`
- Agent messages: left-aligned, no bubble (on-surface), medium left margin
- Tool stacks: left-aligned, smaller padding, same margin as agent messages
- Tool calls: small bubble with corner radius, expandable to show result

### Phase 5: Scroll Behavior
- Scrollbar fade-on-idle: custom `useScrollbarFade` hook (5-second timeout)
- Jump-to-latest: already built into `VirtualizedThread` via `followScroll` + scroll indicator button
- CSS: 3px scrollbar is already global

## Files Changed

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/components/agent/AcpChat.tsx` | Complete rewrite: replace @assistant-ui/react with acp-chat-react components |
| `apps/web/src/components/agent/AgentPane.tsx` | Wire acpSessionManager to pass store/controller to AcpChat |
| `apps/web/src/components/agent/acp-chat.css` | Updated styling for new component structure |

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/hooks/useScrollbarFade.ts` | Custom hook for 5-second scrollbar fade |
| `apps/web/src/components/agent/YmirSettingsRow.tsx` | Custom settings row for Composer (mode/model/session selects) |

### Unchanged Files
| File | Reason |
|------|--------|
| `apps/web/src/lib/acp-session-manager.ts` | Already provides everything needed |
| `apps/web/src/components/agent/AgentRuntimeProvider.tsx` | Kept for backward compat; AcpChat no longer uses it |
| `apps/web/src/store.ts` | Accumulator still runs; new UI reads from AcpStore instead |
| `~/acp-chat-ui-react/packages/acp-chat-react/` | No changes needed to external package |

## Dependency Order

```
Phase 1 (AcpChat rewrite) depends on nothing
Phase 2 (AgentPane wiring) depends on Phase 1
Phase 3 (Settings row) depends on Phase 1
Phase 4 (Message styling) depends on Phase 1
Phase 5 (Scroll behavior) depends on Phase 1

Phases 2-5 are independent of each other and can proceed in parallel after Phase 1.
```

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| AcpStore not populated (events not flowing through acp-session-manager) | Medium | Verify acp_payload routing in store.ts calls `acpSessionManager.handleAcpPayloadByAgentTabId()`; add if missing |
| CSS class name conflicts between acp-chat-react and existing styles | Low | Use scoped data-attribute selectors from acp-chat-react components |
| VirtualizedThread height estimation issues | Low | Use `estimatedRowHeight` prop; acp-chat-react handles dynamic measurement |
| Composer disabled state (requires connected + initialized + sessionId) | Medium | Ensure session controller initialization flow is triggered from AgentPane |
