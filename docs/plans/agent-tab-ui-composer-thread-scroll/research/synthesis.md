# Research Synthesis: Agent Tab UI – Composer, Thread, and Scroll Behaviors

## Key Findings

### Codebase Impact

#### Current Architecture: Two Competing Chat Components

There are **two** agent chat components in the codebase, both rendering via `@assistant-ui/react` primitives:

1. **`AcpChat.tsx`** (`apps/web/src/components/agent/AcpChat.tsx`) — The simpler/older version:
   - Uses `ThreadPrimitive.Root > Viewport > Messages` + `ViewportFooter` containing the composer
   - Messages are differentiated by `message.role` (user vs assistant)
   - Has no tool/data part rendering — only text via `MessagePartPrimitive.Text`
   - Composer is simple: just a `ComposerPrimitive.Input` + Send/Stop buttons
   - Styled via `acp-chat.css`

2. **`AgentChat.tsx`** (`apps/web/src/components/agent/AgentChat.tsx`) — The newer, richer version:
   - Also uses `ThreadPrimitive.Root > Viewport > Messages` + `ViewportFooter`
   - Has full tool/data part rendering via `EventContentPart` (tool cards, permission cards, etc.)
   - Has config selectors (mode, model) in the composer footer
   - Has agent type selector with status dot
   - Uses `autoScroll={false}` on the Viewport
   - Styled via `agent.css` (the `assistant-demo-*` classes)
   - This is the component actually rendered in `AgentPane.tsx` (not AcpChat — AcpChat is imported but unused)

   **CRITICAL:** In `AgentPane.tsx` line 6, `AcpChat` is imported but NOT rendered. The tab rendering at line 270-277 calls `AcpChat` but looking at the imports, **both** are available. The actual render path at line 270 uses `<AcpChat>`, but this may be the wrong component. The richer `AgentChat` component has the tool/data rendering that the PROMPT.md requirements need.

#### Runtime Provider: `AgentRuntimeProvider.tsx`
- Bridges Ymir's `acpAccumulator` store (Zustand) to `@assistant-ui/react`'s `useExternalStoreRuntime`
- Converts `AccumulatedMessage` → `ThreadMessageLike` (assistant-ui format)
- Maps content parts: text, structured → text, tool → tool-call, context → data, permission → data, error → text
- Tracks streaming status for `isRunning`
- Handles `onNew` (sends `AgentSend` WS message) and `onCancel` (sends `AgentCancel`)

#### State Shape: `AccumulatedThread`
- Lives in `acpAccumulator.threads: Map<string, AccumulatedThread>` in Zustand store
- Key fields: `messages: AccumulatedMessage[]`, `isStreaming`, `sessionStatus`, `configOptions`
- Each `AccumulatedMessage` has `parts: AccumulatedContentPart[]` (text, tool, context, permission, error, image)

#### Layout Structure
- `MainPanel.tsx` uses `react-resizable-panels` vertical split: Agent (top) | Separator | Terminal (bottom)
- `AgentPane.tsx` uses `@base-ui/react` Tabs for multiple agent tabs
- Tab content lives in `.agent-panel-content` with `flex: 1; overflow: hidden`
- The chat component must fill this container with `height: 100%`

### Library Landscape

#### @assistant-ui/react (v0.12.19) — Primary UI Primitives
The project uses `@assistant-ui/react` primitives for chat rendering. Key available primitives:

**ThreadPrimitive:**
- `Root` — Container
- `Viewport` — Scrollable viewport with `autoScroll`, `turnAnchor`, `scrollToBottomOnRunStart` props
- `ViewportFooter` — Sticky footer at bottom of viewport (where composer goes)
- `Messages` — Renders message list with `({ message }) => ReactNode` render prop
- `ScrollToBottom` — Button that scrolls to bottom (built-in!)
- `Empty` — Empty state
- `If` — Conditional rendering

**ComposerPrimitive:**
- `Root` — Composer container
- `Input` — `<textarea>` input
- `Send` — Send button (auto-hides when not applicable)
- `Cancel` — Stop button (auto-hides when not applicable)
- `If` — Conditional show/hide
- `AddAttachment`, `Attachments`, `AttachmentDropzone`, `Dictate`, `Quote` — Other features

**MessagePrimitive:**
- `Root` — Message container
- `Parts` — Renders content parts with custom component mapping via `components` prop
- Part types: `Text`, `tools.Fallback`, `data.Fallback` (for tool-call and data parts)

**MessagePartPrimitive:**
- `Text` — Text content renderer

#### acp-chat-react Package — Alternative Components (NOT currently used)
Located at `~/acp-chat-ui-react/packages/acp-chat-react/`. This is a SEPARATE library with its own component set:
- `Thread` / `VirtualizedThread` — Full virtualized thread with TanStack Virtual, scroll following, "new messages" indicator
- `Composer` — Full composer with settings row, slash commands, send/stop
- `MessageCard`, `MessageList`, `ContentRenderer`
- `ThoughtStack`, `ToolCall`, `PermissionRequestCard`
- `SettingsPanel`, `SessionList`

**This package is NOT used in the Ymir web app.** The Ymir app uses `@assistant-ui/react` primitives directly, not `acp-chat-react` components.

#### @tanstack/react-virtual (v3.13.24) — Available for virtualization
Already in package.json. The `acp-chat-react` package uses it internally.

### Patterns to Follow

#### Internal Scroll Pattern (theme.css)
The app already has a global scrollbar style:
```css
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent;
}
*::-webkit-scrollbar { width: 3px; height: 3px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.28); border-radius: 999px; }
```
This already matches most of the PROMPT.md scrollbar requirements (3px, no track, rounded). The only missing feature is the **fade-on-idle** behavior (fade after 5 seconds of no mouse movement).

#### CSS Variable System (theme.css)
All components use `hsl(var(--...))` patterns. The theme uses shadcn/ui dark theme tokens. New CSS should follow this pattern.

#### Layout Pattern (agent.css)
The `agent-chat-demo` pattern in `agent.css` provides the closest existing precedent:
- Thread viewport with `overflow-y: auto`
- Sticky footer composer via `assistant-demo-footer-shell { position: sticky; bottom: 0 }`
- Empty state handling
- Config selectors in composer footer

#### Message Rendering Pattern (AgentChat.tsx)
The `AgentMessage` component shows the tool/data part rendering pattern:
```tsx
<MessagePrimitive.Parts
  components={{
    Text: () => <div>...</div>,
    tools: { Fallback: AgentToolPart },
    data: { Fallback: AgentToolPart },
  }}
/>
```

### Technical Considerations

#### Thread Layout: Thread above, Composer below
The current pattern places the composer **inside** the viewport as a `ViewportFooter`, which makes it part of the scrollable content. The PROMPT.md wants:
- Thread takes remaining vertical space
- Composer pinned to bottom

This is achievable with the current `ThreadPrimitive.Viewport` + `ViewportFooter` pattern since `ViewportFooter` is sticky at the bottom. The `assistant-demo-footer-shell` class already does `position: sticky; bottom: 0`.

Alternatively, a flex layout with the thread as `flex: 1; overflow-y: auto` and composer as `flex-shrink: 0` at the bottom would also work.

#### Scroll-to-Bottom / Jump-to-Latest Button
`@assistant-ui/react` provides `ThreadPrimitive.ScrollToBottom` — a built-in primitive that only renders when scrolled away from bottom and scrolls to bottom on click. This maps directly to the PROMPT.md "Jump to Latest" button requirement.

The `acp-chat-react` `VirtualizedThread` also has a built-in scroll indicator button with the same behavior.

#### Tool Stack Expandable Sections
The PROMPT.md requires tool stacks to be:
- "On-surface, aligned left (smaller padding, same margin as agent messages)"
- "Expandable to show tool calls"
- "Each tool call should be a bubble"
- "Each tool call should be expandable to show tool result"

The current `AgentChat.tsx` uses `EventContentPart` which renders `ToolCard` and `PermissionCard` but they are NOT expandable — they show all content at once. This is a gap. The tool cards need to be made expandable (collapsible).

#### Custom Scrollbar Fade Behavior
The PROMPT.md requires the scrollbar to "fade when the mouse hasn't moved in 5 seconds" with the "mouse move boundary is the thread component." This requires custom CSS/JS:
- Track mouse movement within the thread container
- Show scrollbar on movement
- Fade out after 5 seconds of no movement
- CSS `scrollbar-color` or `::-webkit-scrollbar-thumb` with opacity transitions

This is NOT currently implemented. A custom hook (e.g., `useScrollbarFade`) or CSS-only approach with `:hover` on the container would be needed.

#### Composer Layout Requirements
The PROMPT.md specifies:
- Minimum 2 text rows
- A single row at bottom with: Left (ACP Mode Select, ACP Model Select, ACP Session Select) | Gap | Right (Submit/Stop)

The `AgentChat.tsx` already has config selectors in the footer (`ConfigSelector` for mode/model) and an `AgentSelector` for agent type. The layout is close but needs refinement:
- Need an ACP Session Select (not currently present as a separate control)
- The layout should be a single controls row with left-aligned selectors and right-aligned Submit/Stop

### Decisions for the Planner

1. **Which component to build on?** `AcpChat.tsx` (simpler, currently rendered in AgentPane) or `AgentChat.tsx` (richer, has tool rendering and config selectors)? Given the PROMPT requirements for tool stacks, config selectors, and session select, `AgentChat.tsx` is the stronger starting point.

2. **Composer positioning:** Use `ThreadPrimitive.ViewportFooter` (sticky within viewport, current pattern) OR separate the composer outside the viewport (fixed at container bottom)? The sticky footer pattern works but the separate approach gives cleaner scroll behavior.

3. **Expandable tool stacks:** The `EventContentPart` → `ToolCard`/`PermissionCard` components need to be made expandable/collapsible. This is purely Ymir-side rendering work using `details`/`summary` or React state toggles. No changes needed to `acp-chat-react` or `acp-chat-core`.

4. **Scrollbar fade behavior:** Implement as a custom hook + CSS opacity transition on the scrollbar container. This is purely Ymir-side. No changes needed to external packages.

5. **Jump-to-Latest button:** Use `ThreadPrimitive.ScrollToBottom` from `@assistant-ui/react` (already available) or build custom. The built-in primitive should work.

6. **User message bubble styling:** The `.assistant-demo-message.user` already has bubble styling (`border-radius: 1rem 1rem 0.25rem 1rem; background: hsl(var(--primary) / 0.42)`). Agent messages are already on-surface (no bubble, transparent background). This matches the requirements.

7. **acp-chat-react package:** The PROMPT says "Use acp-chat-react components with custom styling where possible." However, the current Ymir app does NOT use `acp-chat-react` components at all — it uses `@assistant-ui/react` primitives directly. Migrating to `acp-chat-react` components would be a significant refactor. The constraint about "HALT if not achievable with acp-chat-react" needs clarification: does the user want to switch TO acp-chat-react, or continue using @assistant-ui/react primitives? Both are capable of meeting the requirements.

### Gaps and Uncertainties

1. **acp-chat-react vs @assistant-ui/react:** The PROMPT says to use `acp-chat-react` components, but the existing code uses `@assistant-ui/react` primitives. This is a potential contradiction that needs clarification. The `acp-chat-react` package has `Thread`, `Composer`, `VirtualizedThread`, `MessageCard`, `ToolCall`, etc., but they require an `AcpStore` (from acp-chat-react's own store), not Ymir's Zustand accumulator. Bridging would require adapting the store or using the packages differently.

2. **ACP Session Select:** The PROMPT mentions "ACP Session Select" as a control. The current code has `AgentSelector` (selects between agent types) but not a session selector. The `configOptions` from the thread may include session-related options, or this may need a new WS protocol message.

3. **Tool stack grouping:** The PROMPT says "tool stacks" should be expandable. Currently, individual tool calls are rendered inline within assistant messages. Grouping consecutive tool calls into a "stack" with a single expandable container would require changes to the message rendering logic.
