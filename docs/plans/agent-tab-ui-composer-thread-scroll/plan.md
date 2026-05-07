# Detailed Implementation Plan: Agent Tab UI – Composer, Thread, and Scroll Behaviors

**Branch:** `feat/agent-tab-ui-chat`  
**Outline:** `outline.md` (in this directory)

---

## Rune R1: AcpChat Component Rewrite

**Phase:** 1 (Core Structure)  
**Files Modified:** `apps/web/src/components/agent/AcpChat.tsx`

### What
Replace the entire contents of `AcpChat.tsx`. Currently it uses `@assistant-ui/react` primitives (`ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`). Rewrite it to use `acp-chat-react` components (`Thread`, `Composer`) driven by `AcpStore` + `SessionController`.

### Why
The PROMPT requires using `acp-chat-react` components. The existing `AcpChat.tsx` uses `@assistant-ui/react` primitives which are the wrong abstraction — they need an `AssistantRuntimeProvider` and `useExternalStoreRuntime` bridge, while `acp-chat-react` components accept `AcpStore` directly.

### How

1. **Change imports:**
   - Remove: `@assistant-ui/react` (ThreadPrimitive, ComposerPrimitive, MessagePrimitive, MessagePartPrimitive)
   - Remove: `./AgentRuntimeProvider`
   - Add: `import { Thread, Composer } from '@harms-haus/acp-chat-react'`
   - Add: `import type { AcpStore, AcpStoreSnapshot } from '@harms-haus/acp-chat-react'`
   - Add: `import type { SessionController } from '@harms-haus/acp-chat-core'`

2. **Change props interface:**
   ```typescript
   interface AcpChatProps {
     agentTabId: string;
     agentType: string;
     store: AcpStore;
     controller: SessionController;
   }
   ```
   - Remove: `sessionId`, `worktreeId`, `threadId`, `onSendMessage`
   - Add: `agentTabId`, `store` (AcpStore instance), `controller` (SessionController instance)

3. **Component body:**
   - Remove the `useStore` call (thread state comes from AcpStore now)
   - Remove the `AgentRuntimeProvider` wrapper
   - Render a flex container (column, height: 100%) with:
     - `<Thread>` as `flex: 1; overflow: hidden` (takes remaining space)
     - `<Composer>` as `flex-shrink: 0` (pinned to bottom)

4. **Thread configuration:**
   ```tsx
   <Thread
     store={store}
     controller={controller}
     layout="expanded"
     followScroll={true}
     follow={true}
     className="ymir-agent-thread"
   />
   ```
   - `layout="expanded"`: full width per PROMPT (no max-width)
   - `follow={true}`: auto-expand thought stacks during active work
   - `followScroll={true}`: auto-scroll to bottom on new items

5. **Composer configuration:**
   ```tsx
   <Composer
     store={store}
     controller={controller}
     minRows={2}
     placeholder={`Ask ${agentType}...`}
     renderSettingsRow={YmirSettingsRow}
     className="ymir-agent-composer"
   />
   ```
   - `minRows={2}`: per PROMPT (minimum 2 text rows)
   - `renderSettingsRow`: custom settings row for ACP Mode/Model/Session selects (see Rune R4)

6. **Empty state:** Thread's built-in empty state is fine ("No messages yet - waiting for session updates...")

### Acceptance Criteria
- [ ] AcpChat renders `Thread` and `Composer` from acp-chat-react
- [ ] No imports from `@assistant-ui/react`
- [ ] No dependency on `AgentRuntimeProvider`
- [ ] Props accept `AcpStore` + `SessionController` directly
- [ ] Component is a pure presentation layer — reads from store, renders components

### Dependencies
- None (this is Phase 1, the foundation)

---

## Rune R2: AgentPane Wiring

**Phase:** 2 (Integration)  
**Files Modified:** `apps/web/src/components/agent/AgentPane.tsx`

### What
Update `AgentPane.tsx` to:
1. Create `SessionController` instances via `acpSessionManager` when agent sessions appear
2. Pass `AcpStore` and `SessionController` to the new `AcpChat`

### Why
Currently `AgentPane` passes `sessionId`, `threadId`, `worktreeId`, `onSendMessage` to `AcpChat`. The new `AcpChat` needs `AcpStore` + `SessionController` instead. Also, no code currently calls `acpSessionManager.getOrCreateController()` — controllers are never created for real sessions, so `handleAcpPayload` drops all events.

### How

1. **Add import:**
   ```typescript
   import { acpSessionManager } from '../../lib/acp-session-manager';
   ```

2. **Create controllers when sessions appear (in the existing useEffect that adds tabs):**
   In the `useEffect` block (lines 86-99) that creates agent tabs from `agentSessions`:
   ```typescript
   useEffect(() => {
     agentSessions.forEach((session) => {
       if (!addedTabsRef.current.has(session.id) && !tabSessionIds.has(session.id)) {
         // ... existing tab creation code ...
         
         // Ensure acpSessionManager has a controller for this session
         const agentTabId = session.agentTabId ?? session.id;
         if (!acpSessionManager.hasController(agentTabId)) {
           acpSessionManager.getOrCreateController(agentTabId, worktreeId);
         }
       }
     });
   }, [worktreeId, tabSessionIds, agentSessions, addAgentTab]);
   ```

3. **Clean up controllers when tabs close (in `handleCloseTab`):**
   ```typescript
   const handleCloseTab = useCallback((tabId: string) => {
     const tab = tabs.find((t) => t.id === tabId);
     if (tab?.sessionId) {
       const session = agentSessions.find((as) => as.id === tab.sessionId);
       if (session) {
         // ... existing cancel logic ...
         acpSessionManager.removeController(session.agentTabId ?? session.id);
       }
     }
     removeAgentTab(worktreeId, tabId);
   }, [worktreeId, tabs, agentSessions, removeAgentTab, client]);
   ```

4. **Pass AcpStore + Controller to AcpChat (in the render section, lines 270-277):**
   ```tsx
   {tab.type === 'agent' && sessionForTab && (
     <AcpChat
       agentTabId={sessionForTab.agentTabId ?? sessionForTab.id}
       agentType={sessionForTab.agentType}
       store={acpSessionManager.getAcpStore(sessionForTab.agentTabId ?? sessionForTab.id)!}
       controller={acpSessionManager.getOrCreateController(
         sessionForTab.agentTabId ?? sessionForTab.id,
         worktreeId
       )}
     />
   )}
   ```

5. **Remove `handleSendMessage` callback** (sending is now handled by `Composer` → `SessionController.sendPrompt()` directly through `acpSessionManager`)

### Acceptance Criteria
- [ ] `acpSessionManager.getOrCreateController()` is called when agent sessions appear
- [ ] `acpSessionManager.removeController()` is called when tabs close
- [ ] AcpChat receives a valid `AcpStore` and `SessionController`
- [ ] No `onSendMessage` callback needed — Composer uses controller.sendPrompt() directly

### Dependencies
- Rune R1 (new AcpChat props interface)

---

## Rune R3: Scrollbar Fade-on-Idle

**Phase:** 5 (Scroll Behavior)  
**Files Created:** `apps/web/src/hooks/useScrollbarFade.ts`

### What
Create a `useScrollbarFade` hook that adds/removes a CSS class on the thread viewport element based on mouse activity. The scrollbar should be visible when the mouse is moving over the thread and fade out after 5 seconds of no movement.

### Why
PROMPT requires: "Should fade when the mouse hasn't moved in 5 seconds. The mouse move boundary is the thread component." The global CSS already provides 3px/no-track/rounded scrollbar. Only the fade-on-idle behavior is missing.

### How

1. **Hook implementation:**
   ```typescript
   import { useEffect, useRef, useCallback } from 'react';

   const FADE_TIMEOUT_MS = 5000;

   export function useScrollbarFade(containerRef: React.RefObject<HTMLElement | null>) {
     const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

     const handleMouseMove = useCallback(() => {
       const el = containerRef.current;
       if (!el) return;
       
       el.classList.add('scrollbar-visible');
       
       if (timerRef.current) {
         clearTimeout(timerRef.current);
       }
       timerRef.current = setTimeout(() => {
         el.classList.remove('scrollbar-visible');
       }, FADE_TIMEOUT_MS);
     }, [containerRef]);

     const handleMouseLeave = useCallback(() => {
       const el = containerRef.current;
       if (!el) return;
       
       if (timerRef.current) {
         clearTimeout(timerRef.current);
       }
       el.classList.remove('scrollbar-visible');
     }, [containerRef]);

     useEffect(() => {
       const el = containerRef.current;
       if (!el) return;

       el.addEventListener('mousemove', handleMouseMove);
       el.addEventListener('mouseleave', handleMouseLeave);

       return () => {
         el.removeEventListener('mousemove', handleMouseMove);
         el.removeEventListener('mouseleave', handleMouseLeave);
         if (timerRef.current) {
           clearTimeout(timerRef.current);
         }
       };
     }, [containerRef, handleMouseMove, handleMouseLeave]);
   }
   ```

2. **CSS (in acp-chat.css or agent.css):**
   ```css
   /* Scrollbar fade behavior */
   .ymir-agent-thread .acp-thread__viewport {
     scrollbar-color: transparent transparent;
     transition: scrollbar-color 0.3s ease;
   }
   .ymir-agent-thread .acp-thread__viewport.scrollbar-visible {
     scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent;
   }
   .ymir-agent-thread .acp-thread__viewport::-webkit-scrollbar-thumb {
     background: transparent;
     transition: background 0.3s ease;
   }
   .ymir-agent-thread .acp-thread__viewport.scrollbar-visible::-webkit-scrollbar-thumb {
     background: hsl(var(--muted-foreground) / 0.28);
   }
   ```

3. **Integration point:** In `AcpChat.tsx`, get a ref to the VirtualizedThread's viewport via `Thread`'s `VirtualizedThreadRef` and apply the hook. Since `Thread` wraps `VirtualizedThread` but doesn't expose the ref, we need to target the viewport via a container ref + querySelector, or add a `data-acp-thread-scroll-viewport` selector. The viewport element has `data-acp-thread-scroll-viewport` attribute, so we can query it from a parent ref.

### Acceptance Criteria
- [ ] Scrollbar is transparent by default
- [ ] Scrollbar becomes visible when mouse moves within the thread
- [ ] Scrollbar fades back to transparent after 5 seconds of no movement
- [ ] Scrollbar fades immediately when mouse leaves the thread
- [ ] Uses CSS transitions for smooth fade

### Dependencies
- Rune R1 (need the AcpChat component to apply the hook)

---

## Rune R4: Custom Settings Row

**Phase:** 3 (Settings Row)  
**Files Created:** `apps/web/src/components/agent/YmirSettingsRow.tsx`

### What
Create a custom settings row component for the Composer. The PROMPT specifies a single row with left-aligned ACP Mode Select, ACP Model Select, ACP Session Select | gap | right-aligned Submit/Stop button.

### Why
The Composer's built-in `DefaultSettingsRow` is a placeholder that just shows counts. We need actual dropdown selects using Ymir's existing `@base-ui/react` Select components, styled to match the existing agent UI.

### How

1. **Component signature:**
   ```typescript
   import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';
   ```

2. **Layout:** Single row, flexbox:
   - Left side: 3 Select dropdowns (Mode, Model, Session) — these come from `SettingsRowRenderProps.modes`, `.models`, `.sessions`
   - Middle: flex gap spacer
   - Right side: Submit/Stop button is NOT part of the settings row (it's inside the Composer's input container). So the settings row only has the left-aligned selectors.

   Wait — looking at the Composer component structure, the Send/Stop buttons are in `acp-composer__controls` which is inside `acp-composer__input-container`, next to the textarea. The settings row is BELOW the input container. So the layout is:
   ```
   [textarea                ] [Send/Stop]   ← input-container
   [Mode▼] [Model▼] [Session▼]             ← settings-row
   ```
   
   The PROMPT says: "A single row is reserved across the bottom of the composer for controls: Left-aligned: ACP Mode Select, ACP Model Select, ACP Session Select. Middle: Gap. Right-aligned: Submit/Stop button."
   
   This means the settings row should contain BOTH the selects AND the send/stop button. But the Composer component already renders Send/Stop inside the input-container. We have two options:
   - A) Keep the Composer's default Send/Stop position (top-right of textarea) and add selects in settings row
   - B) Move Send/Stop to the settings row and hide the Composer's default controls
   
   Option A is simpler and closer to what the Composer already does. The PROMPT's layout can be interpreted as having the controls row at the bottom of the composer, with Send/Stop at the right of the textarea area. The Composer's current layout puts Send/Stop next to the textarea which is functionally equivalent.

3. **Implementation:**
   ```tsx
   import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';
   import { Select } from '@base-ui/react';

   export function YmirSettingsRow(props: SettingsRowRenderProps) {
     const { modes, models, sessions, selectedModeId, selectedModelId,
             selectedSessionId, onModeChange, onModelChange, onSessionChange, disabled } = props;
     
     return (
       <div data-ymir-settings-row className="ymir-settings-row">
         <div className="ymir-settings-row__left">
           {modes.length > 0 && (
             <Select.Root value={selectedModeId} onValueChange={(v) => onModeChange(modes.find(m => m.id === v)!)}>
               <Select.Trigger className="ymir-settings-select">...</Select.Trigger>
               <Select.Portal><Select.Positioner><Select.Popup>
                 {modes.map(mode => <Select.Item key={mode.id} value={mode.id}>{mode.name}</Select.Item>)}
               </Select.Popup></Select.Positioner></Select.Portal>
             </Select.Root>
           )}
           {models.length > 0 && (/* similar */)}
           {sessions.length > 0 && (/* similar */)}
         </div>
       </div>
     );
   }
   ```

4. **CSS:** Minimal styling matching existing agent.css conventions (tiny labels, `0.6875rem` font size, `hsl(var(--...))` colors).

### Acceptance Criteria
- [ ] Settings row renders ACP Mode, Model, Session selects when available
- [ ] Selects use `@base-ui/react` Select component (consistent with rest of Ymir UI)
- [ ] Styling matches existing agent.css patterns
- [ ] Row is below the textarea input

### Dependencies
- Rune R1 (YmirSettingsRow is passed as `renderSettingsRow` to Composer)

---

## Rune R5: Message and Tool Stack Styling

**Phase:** 4 (Styling)  
**Files Modified:** `apps/web/src/components/agent/acp-chat.css`

### What
Write CSS for the acp-chat-react components to match PROMPT requirements:
- User messages: right-aligned bubble
- Agent messages: left-aligned, on-surface (no bubble)
- Tool stacks: left-aligned, smaller padding, expandable
- Tool calls: bubble with corner radius, expandable

### Why
The acp-chat-react components use `data-*` attributes for styling hooks. We need custom CSS targeting these attributes to achieve the PROMPT's visual requirements.

### How

Key CSS selectors based on acp-chat-react's data attributes:

```css
/* === Thread Layout === */
.ymir-agent-thread {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.ymir-agent-thread .acp-thread__viewport {
  flex: 1;
  overflow-y: auto;
}

/* === User Messages (right-aligned bubble) === */
.ymir-agent-thread [data-acp-message-role="user"] {
  margin-left: auto;
  margin-right: 0.75rem;
  max-width: 80%;
}
.ymir-agent-thread [data-acp-message-role="user"] .acp-message-card {
  border-radius: 1rem 1rem 0.25rem 1rem;
  background: hsl(var(--primary) / 0.42);
  padding: 0.5rem 0.75rem;
}

/* === Agent Messages (left-aligned, on-surface) === */
.ymir-agent-thread [data-acp-message-role="assistant"] {
  margin-left: 1rem;
  margin-right: auto;
  max-width: 100%;
}
.ymir-agent-thread [data-acp-message-role="assistant"] .acp-message-card {
  background: transparent;
  padding: 0.25rem 0;
}

/* === Thought/Tool Stacks (left-aligned, smaller padding) === */
.ymir-agent-thread [data-acp-thought-stack] {
  margin-left: 1rem;
  padding: 0.25rem 0.5rem;
}
.ymir-agent-thread [data-acp-thought-trigger] {
  /* collapsed stack trigger styling */
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

/* === Tool Calls (bubble with corner radius, expandable) === */
.ymir-agent-thread [data-acp-tool-call-root] {
  border-radius: 0.375rem;
  background: hsl(var(--card) / 0.5);
  padding: 0.375rem 0.5rem;
  margin: 0.25rem 0;
}
.ymir-agent-thread [data-acp-tool-call-header] {
  cursor: pointer;
  font-size: 0.75rem;
}
.ymir-agent-thread [data-acp-tool-call-details] {
  font-size: 0.6875rem;
  margin-top: 0.25rem;
}

/* === Composer === */
.ymir-agent-composer {
  flex-shrink: 0;
  border-top: 1px solid hsl(var(--border));
  padding: 0.5rem;
}
.ymir-agent-composer .acp-composer__textarea {
  width: 100%;
  min-height: 3rem; /* ~2 rows */
  resize: none;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  padding: 0.5rem;
  color: hsl(var(--foreground));
  font-size: 0.875rem;
}

/* === Jump to Latest Button === */
.ymir-agent-thread .acp-thread__scroll-indicator {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  /* ... match existing button styles ... */
}
```

Note: Exact data-attribute selectors need to be verified against actual rendered output. The above are based on reading the acp-chat-react source. The implementer should inspect the DOM and adjust selectors as needed.

### Acceptance Criteria
- [ ] User messages appear as right-aligned bubbles
- [ ] Agent messages appear left-aligned with no bubble (on-surface)
- [ ] Tool stacks are left-aligned with smaller padding than messages
- [ ] Individual tool calls are bubbles with corner radius
- [ ] Tool calls are expandable (built into acp-chat-react ToolCall component)
- [ ] Composer textarea has border, corner radius, min 2 rows
- [ ] All colors use `hsl(var(--...))` pattern from theme.css

### Dependencies
- Rune R1 (need the component structure to target with CSS)

---

## Rune R6: Integration Verification

**Phase:** All (cross-cutting)  
**No files modified** — this is a manual testing guide

### Verification Checklist

1. **Store Population:**
   - Open browser DevTools console
   - Look for `[AcpSessionManager]` warnings about dropped payloads
   - If present, controllers are not being created → check Rune R2 wiring

2. **Thread Rendering:**
   - Send a message via Composer
   - Verify user message appears as right-aligned bubble
   - Verify agent response appears left-aligned, on-surface
   - Verify tool calls appear in expandable groups

3. **Composer:**
   - Verify textarea has min 2 rows
   - Verify settings row appears with Mode/Model/Session selects
   - Verify Send button sends prompt through SessionController
   - Verify Stop button cancels prompt

4. **Scroll:**
   - Fill thread with enough messages to scroll
   - Verify scrollbar appears on mouse movement
   - Verify scrollbar fades after 5 seconds of no movement
   - Verify "Jump to Latest" button appears when scrolled up
   - Verify clicking it scrolls to bottom

5. **No Regressions:**
   - Existing agent session creation still works (AgentSpawn)
   - Existing tab management (add/remove/rename) still works
   - Terminal panel unaffected
   - No console errors from @assistant-ui/react (should no longer be imported by AcpChat)

### Dependencies
- All previous Runes

---

## Execution Order

```
R1 (AcpChat rewrite) → R2 (AgentPane wiring) → R4 (Settings row) → R5 (Styling) → R3 (Scrollbar fade) → R6 (Verification)
```

R4, R5, and R3 can be done in any order after R1. R2 must come after R1. R6 is last.

## Estimated Complexity

| Rune | Size | Risk |
|------|------|------|
| R1 | Medium | Low (straightforward component swap) |
| R2 | Medium | Medium (integration gap: controllers not being created yet) |
| R3 | Small | Low (simple hook + CSS) |
| R4 | Medium | Low (follows existing patterns) |
| R5 | Medium | Low (CSS work, data-attribute selectors may need adjustment) |
| R6 | N/A | N/A |
