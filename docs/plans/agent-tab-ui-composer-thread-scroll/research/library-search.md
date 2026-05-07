# Library Search: Agent Tab UI – Composer, Thread, and Scroll Behaviors

## Existing Dependencies (package.json)

### @assistant-ui/react (v0.12.19) — PRIMARY UI FRAMEWORK
- **Purpose:** Headless React components for chat UIs
- **Status:** Already in use, provides the core primitives
- **Key APIs:**
  - `ThreadPrimitive`: Root, Viewport, ViewportFooter, Messages, ScrollToBottom, Empty, If
  - `ComposerPrimitive`: Root, Input, Send, Cancel, If
  - `MessagePrimitive`: Root, Parts (with custom component mapping)
  - `MessagePartPrimitive`: Text
  - `useExternalStoreRuntime`: Bridges external state to assistant-ui runtime
  - `AssistantRuntimeProvider`: Context provider
- **Relevance:** All thread/composer/message rendering uses these primitives. The `ScrollToBottom` primitive directly maps to the "Jump to Latest" requirement.
- **Limitations:** No built-in scrollbar fade behavior. No built-in tool stack expandable sections.

### @tanstack/react-virtual (v3.13.24) — VIRTUALIZATION
- **Purpose:** Efficient rendering of large lists
- **Status:** Already installed, used by acp-chat-react internally
- **Relevance:** May be useful for long threads with many messages, but for initial implementation, the thread is expected to be small enough for native DOM rendering. The `VirtualizedThread` in acp-chat-react uses this.

### @base-ui/react (v1.3.0) / @base-ui-components/react (1.0.0-rc.0) — UI PRIMITIVES
- **Purpose:** Unstyled UI components (Tabs, Select, etc.)
- **Status:** Already in use for tabs and select dropdowns
- **Relevance:** The `Select` component is used for mode/model/agent selectors in the composer. Available for ACP Session Select.

### react-resizable-panels (v4.7.3) — PANEL LAYOUT
- **Purpose:** Resizable panel layout
- **Status:** Used for agent/terminal split
- **Relevance:** Context only. The chat component fills whatever panel size is allocated.

### zustand (v5.0.12) — STATE MANAGEMENT
- **Purpose:** Global state store
- **Status:** Used for accumulator, sessions, tabs
- **Relevance:** The `acpAccumulator` slice holds all thread state.

## External Libraries Not Currently Used

### No additional libraries needed
Based on the analysis:
1. **Scrollbar fade:** Can be implemented with CSS transitions + a small React hook. No library needed.
2. **Tool stack expandable:** Can be implemented with CSS transitions + React state. No library needed.
3. **Jump to latest:** `ThreadPrimitive.ScrollToBottom` from @assistant-ui/react handles this.
4. **Composer layout:** CSS flexbox is sufficient.
5. **Textarea auto-resize:** The @assistant-ui/react `ComposerPrimitive.Input` already handles this.

## acp-chat-react Package (~/acp-chat-ui-react/)

### Status: Available but NOT used by Ymir web app
- Has its own store (`AcpStore`), hooks, and components
- Has `Thread`, `VirtualizedThread`, `Composer`, `MessageCard`, `ToolCall`, `ThoughtStack`, `PermissionRequestCard`
- Uses `@harms-haus/acp-chat-core` for normalized state
- Would require significant integration work to bridge Ymir's accumulator to `AcpStore`

### Key Components Available (for reference):
| Component | Purpose | Styling |
|-----------|---------|---------|
| `Thread` | Renders message list with thought groups | CSS classes + data attributes |
| `VirtualizedThread` | Virtualized message list with TanStack Virtual | CSS classes |
| `Composer` | Input + Send/Stop + Settings row | CSS classes + data attributes |
| `MessageCard` | Individual message rendering | CSS classes |
| `ThoughtStack` | Expandable thought/tool group | CSS classes |
| `ToolCall` | Expandable tool call | CSS classes |
| `PermissionRequestCard` | Permission prompt | CSS classes |

### Gap Analysis
The `acp-chat-react` components have expandable tool stacks (`ThoughtStack` + `ToolCall`) and a scroll indicator built into `VirtualizedThread`. However, integrating them would require:
1. Bridging Ymir's `AccumulatedThread` → `NormalizedState` (acp-chat-core format)
2. Creating an `AcpStore` instance per thread
3. OR: Forking the components to work with Ymir's data format

The PROMPT constraint says "Use acp-chat-react components with custom styling where possible. If not achievable, HALT." This means the planner needs to decide whether to:
- A) Build on @assistant-ui/react primitives (current approach, all achievable)
- B) Integrate acp-chat-react components (requires store bridging)
- C) Copy patterns from acp-chat-react into Ymir's own components
