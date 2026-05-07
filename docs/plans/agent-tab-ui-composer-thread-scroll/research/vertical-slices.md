# Vertical Slices: Agent Tab UI – Composer, Thread, and Scroll Behaviors

## Hot Path: Message Display Flow

### Entry Point: `AgentPane.tsx` → `AcpChat.tsx`/`AgentChat.tsx`

**File:** `apps/web/src/components/agent/AgentPane.tsx`
- Lines 270-277: Renders `<AcpChat>` for agent-type tabs
- Passes: `sessionId`, `agentType`, `worktreeId`, `threadId`, `onSendMessage`
- Tab content container: `.agent-panel-content` (flex: 1, overflow: hidden)

**File:** `apps/web/src/components/agent/AcpChat.tsx`
- Lines 64: Reads `thread` from `useStore(state => state.acpAccumulator.threads.get(threadId))`
- Lines 78-119: Wraps content in `AgentRuntimeProvider` → `ThreadPrimitive.Root` → `Viewport` → `Messages`
- Lines 86-95: Message rendering: checks `message.role` → `AcpUserMessage` or `AcpAgentMessage`
- Lines 97-115: Composer inside `ViewportFooter`: `ComposerPrimitive.Root` → `Input` + Send/Stop

**File:** `apps/web/src/components/agent/AgentChat.tsx`
- Lines 239-353: `AgentChatContent` — the richer alternative
- Lines 278-351: Full thread with tool/data parts, config selectors, agent selector
- Lines 213-237: `AgentMessage` — renders `MessagePrimitive.Parts` with `tools.Fallback` and `data.Fallback` mapping to `EventContentPart`

### Data Flow: WS → Accumulator → Runtime → UI

1. **WS Events:** `apps/web/src/lib/yws-transport.ts` — receives ACP events
2. **Store:** `apps/web/src/store.ts` — `dispatchAccumulator` sends events to the reducer
3. **Accumulator:** `types/state.ts` — `AcpAccumulatorState.threads: Map<string, AccumulatedThread>`
4. **Runtime Bridge:** `AgentRuntimeProvider.tsx` — converts to `useExternalStoreRuntime`
5. **UI:** `@assistant-ui/react` primitives consume the runtime

### Key File Map

| File | Role | Lines of Interest |
|------|------|------------------|
| `apps/web/src/components/agent/AcpChat.tsx` | Simple chat (currently rendered) | 56-121 |
| `apps/web/src/components/agent/AgentChat.tsx` | Rich chat (has tool rendering) | 213-379 |
| `apps/web/src/components/agent/AgentRuntimeProvider.tsx` | Runtime bridge | 79-119 |
| `apps/web/src/components/agent/AgentPane.tsx` | Tab container | 206-311 |
| `apps/web/src/components/agent/EventCards.tsx` | Tool/Permission/Status cards | 1-395 |
| `apps/web/src/components/agent/card-schema.ts` | Card schema factories | 1-496 |
| `apps/web/src/components/agent/runtimeBoundary.ts` | Runtime boundary docs | 1-344 |
| `apps/web/src/types/state.ts` | Accumulator types | 152-272 |
| `apps/web/src/styles/agent.css` | Agent styles | 1-911 |
| `apps/web/src/components/agent/acp-chat.css` | AcpChat styles | 1-138 |
| `apps/web/src/styles/theme.css` | CSS variables, scrollbar | 1-157 |
| `apps/web/src/styles/panels.css` | Layout panels | 1-289 |

## Hot Path: Composer Flow

### Current Composer: AcpChat.tsx
```
ComposerPrimitive.Root > Input + div.acp-composer-actions > [Send, Cancel]
```
- Simple layout, no config selectors
- Send/Stop buttons in a row below the input

### Current Composer: AgentChat.tsx
```
ComposerPrimitive.Root > div.assistant-demo-composer-shell > Input + float-actions
                     > div.assistant-demo-composer-footer > controls + connection-state
```
- Has floating Send/Stop button positioned absolute top-right of input
- Has config footer row with mode selector, model selector, agent selector, status dot
- More complex but closer to PROMPT.md requirements

### @assistant-ui/react ComposerPrimitive API
- `Root` — Container
- `Input` — Textarea
- `Send` — Rendered as send button (hidden when streaming)
- `Cancel` — Rendered as stop button (hidden when not streaming)
- These use `asChild` pattern for custom rendering

## Hot Path: Scroll Behavior

### ThreadPrimitive.Viewport (assistant-ui)
- Has `autoScroll` prop (default true)
- Has `turnAnchor` prop ("bottom" | "top")
- Has `scrollToBottomOnRunStart`, `scrollToBottomOnInitialize`, `scrollToBottomOnThreadSwitch` props
- `AgentChat.tsx` sets `autoScroll={false}` — means no auto-scroll-follow

### ThreadPrimitive.ScrollToBottom
- Built-in button that renders when scrolled away from bottom
- Clicking scrolls to bottom
- Maps directly to "Jump to Latest" requirement

### Current Scrollbar (theme.css)
- Global: `scrollbar-width: thin; scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent`
- `::-webkit-scrollbar { width: 3px }` — matches PROMPT's 3px requirement
- `border-radius: 999px` — matches PROMPT's rounded requirement
- NO fade-on-idle behavior exists

## Interface Boundaries That Will Change

1. **AcpChat.tsx** — Will need major rework or replacement with richer component
2. **acp-chat.css** — Will need new styles for thread/composer/scroll
3. **EventCards.tsx** — Tool cards need expandable/collapsible behavior
4. **New hook needed** — `useScrollbarFade` or similar for 5-second fade behavior
