# Review Report: Runes bf-2cb9.2.1, bf-2cb9.2.2, bf-2cb9.2.3
## R3, R4, R5: Scrollbar fade, Settings row, and CSS styling

**Rune IDs:** bf-2cb9.2.1, bf-2cb9.2.2, bf-2cb9.2.3
**Reviewer:** Review Sub-Orchestrator
**Review Date:** 2026-05-07
**Status:** PARTIALLY COMPLETE

---

## Executive Summary

Runes bf-2cb9.2.1, bf-2cb9.2.2, and bf-2cb9.2.3 have been **partially implemented**. The CSS styling (R5) is complete and correct, but R3 and R4 have critical integration issues that prevent them from functioning as specified.

**Key Findings:**
- ✅ R1 (AcpChat rewrite): COMPLETE (from bf-2cb9.1.1)
- ✅ R2 (AgentPane wiring): COMPLETE (from bf-2cb9.1.2)
- ❌ R3 (Scrollbar fade): **IMPLEMENTED BUT NOT INTEGRATED**
- ❌ R4 (Settings row): **IMPLEMENTED BUT DOES NOT MATCH SPEC**
- ✅ R5 (Styling): **COMPLETE**
- ❌ R6 (Verification): NOT APPLICABLE (critical integration issues present)

---

## Review Findings by Rune

### Rune R3: Scrollbar Fade-on-Idle (bf-2cb9.2.1)

**Status:** IMPLEMENTED BUT NOT INTEGRATED

**What Was Implemented:**
- ✅ Created `/root/ymir/apps/web/src/hooks/useScrollbarFade.ts` (47 lines)
- ✅ Hook logic matches specification exactly
  - 5000ms fade timeout
  - Adds/removes `scrollbar-visible` class on mouse activity
  - Proper cleanup on mouse leave
  - Clean event listener management in useEffect
- ✅ CSS for scrollbar fade added to `acp-chat.css` (lines 440-457)
  - Uses `scrollbar-color` for standard scrollbar
  - Uses `::-webkit-scrollbar-thumb` for WebKit browsers
  - Transitions configured for smooth fade (0.3s ease)

**Critical Issue - Not Integrated:**
- ❌ The `useScrollbarFade` hook is **NEVER IMPORTED OR USED** in `AcpChat.tsx`
- ❌ No container ref is created to hold the viewport element
- ❌ The hook cannot be applied because `AcpChat.tsx` doesn't have the necessary infrastructure
- Searching the entire `/root/ymir/apps/web/src` directory shows no usage of `useScrollbarFade` except in its definition

**Specification Requirement (from plan.md lines 254):**
> "Integration point: In `AcpChat.tsx`, get a ref to the VirtualizedThread's viewport via `Thread`'s `VirtualizedThreadRef` and apply the hook. Since `Thread` wraps `VirtualizedThread` but doesn't expose the ref, we need to target the viewport via a container ref + querySelector, or add a `data-acp-thread-scroll-viewport` selector. The viewport element has `data-acp-thread-scroll-viewport` attribute, so we can query it from a parent ref."

**Actual Implementation:**
`AcpChat.tsx` (current state):
```tsx
export function AcpChat({
  agentTabId,
  agentType,
  store,
  controller,
}: AcpChatProps) {
  return (
    <div className="acp-chat-container">
      <Thread
        store={store}
        controller={controller}
        layout="expanded"
        followScroll={true}
        follow={true}
        className="ymir-agent-thread"
      />
      <Composer
        store={store}
        controller={controller}
        minRows={2}
        placeholder={`Ask ${agentType}...`}
        className="ymir-agent-composer"
      />
    </div>
  );
}
```

**What's Missing:**
```tsx
import { useScrollbarFade } from '../../hooks/useScrollbarFade';

export function AcpChat({...}) {
  const threadContainerRef = useRef<HTMLDivElement>(null);
  
  useScrollbarFade(threadContainerRef);
  
  return (
    <div className="acp-chat-container" ref={threadContainerRef}>
      <Thread ... />
    </div>
  );
}
```

**Acceptance Criteria Status:**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Scrollbar is transparent by default | ✅ PASS | CSS lines 441-443 |
| Scrollbar becomes visible when mouse moves within the thread | ❌ FAIL | Hook not integrated |
| Scrollbar fades back to transparent after 5 seconds of no movement | ❌ FAIL | Hook not integrated |
| Scrollbar fades immediately when mouse leaves the thread | ❌ FAIL | Hook not integrated |
| Uses CSS transitions for smooth fade | ✅ PASS | CSS lines 443, 452 |

**Code Quality Assessment:**
- ✅ Hook implementation is excellent - clean, correct, follows React patterns
- ✅ CSS is well-written with vendor prefixes and transitions
- ❌ Integration is completely missing

---

### Rune R4: Custom Settings Row for Composer (bf-2cb9.2.2)

**Status:** IMPLEMENTED BUT DOES NOT MATCH SPECIFICATION

**What Was Implemented:**
- ✅ Created `/root/ymir/apps/web/src/components/agent/YmirSettingsRow.tsx` (270 lines)
- ✅ Component renders Mode, Model, and Session selectors
- ✅ Uses `@base-ui/react` Select component as specified
- ✅ CSS styling present in `acp-chat.css` (lines 459-600)
- ✅ Status dots for agent sessions (working/waiting/idle/error)

**Critical Issue 1 - Wrong Props Interface:**

**Specification (plan.md lines 282-283):**
```typescript
import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';

export function YmirSettingsRow(props: SettingsRowRenderProps) {
  const { modes, models, sessions, selectedModeId, selectedModelId,
          selectedSessionId, onModeChange, onModelChange, onSessionChange, disabled } = props;
```

**Actual Implementation:**
```typescript
interface YmirSettingsRowProps {
  worktreeId: string;
  currentAgentType: string;
  onConfigChange: (configId: string, value: string) => void;
  onAgentChange: (agentType: string) => void;
}

export function YmirSettingsRow({
  worktreeId,
  currentAgentType,
  onConfigChange,
  onAgentChange,
}: YmirSettingsRowProps) {
```

**Why This Matters:**
The `SettingsRowRenderProps` interface from acp-chat-react provides:
- `modes: AcpMode[]` - Array of available ACP modes (from the Composer's store)
- `models: AcpModel[]` - Array of available ACP models (from the Composer's store)
- `sessions: SessionItem[]` - Array of available sessions (from the SessionController)
- `selectedModeId` - Current mode selection
- `selectedModelId` - Current model selection
- `selectedSessionId` - Current session selection
- `onModeChange(mode: AcpMode)` - Callback to change mode
- `onModelChange(model: AcpModel)` - Callback to change model
- `onSessionChange(session: SessionItem)` - Callback to change session
- `disabled: boolean` - Whether settings are disabled

The actual implementation:
- Uses Ymir's Zustand store (`useStore`) instead of acp-chat-react's store
- Manually pulls config options from `acpAccumulator.threads`
- Requires the parent to pass `onConfigChange` and `onAgentChange` callbacks
- Does not work with the Composer's `renderSettingsRow` prop

**Critical Issue 2 - Not Integrated with Composer:**

**Specification (plan.md line 69):**
```tsx
<Composer
  ...
  renderSettingsRow={YmirSettingsRow}
  ...
/>
```

**Actual Implementation in AcpChat.tsx:**
```tsx
<Composer
  store={store}
  controller={controller}
  minRows={2}
  placeholder={`Ask ${agentType}...`}
  className="ymir-agent-composer"
/>
```
- No `renderSettingsRow` prop passed
- Component is created but never used

**Critical Issue 3 - CSS Selector Mismatch:**

**Specification (plan.md lines 236-252):**
```css
.ymir-agent-thread .acp-thread__viewport {
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s ease;
}
```

**Actual CSS in acp-chat.css (lines 441-444):**
```css
.ymir-agent-thread .acp-thread__viewport {
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s ease;
}
```

However, the actual data attribute used in the CSS for R5 is `[data-acp-thread-scroll-viewport]` (line 154), not `.acp-thread__viewport`. This is a **CRITICAL CSS SELECTOR MISMATCH**.

**Acceptance Criteria Status:**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Settings row renders ACP Mode, Model, Session selects when available | ❌ PARTIAL | Renders selects but with wrong data source |
| Selects use `@base-ui/react` Select component | ✅ PASS | Lines 2, 133, 175, 221 |
| Styling matches existing agent.css patterns | ✅ PASS | CSS lines 459-600 use hsl(var(--...)) |
| Row is below the textarea input | ❌ FAIL | Component not integrated into Composer |
| Component accepts SettingsRowRenderProps | ❌ FAIL | Uses custom YmirSettingsRowProps interface |

**Code Quality Assessment:**
- ✅ Component is well-structured with separate ModeSelector, ModelSelector, SessionSelector sub-components
- ✅ Uses React patterns correctly (useMemo for derived data)
- ✅ CSS is well-written and styled
- ❌ Does not follow the specification for props interface
- ❌ Does not integrate with Composer's `renderSettingsRow` mechanism

---

### Rune R5: Message and Tool Stack CSS Styling (bf-2cb9.2.3)

**Status:** COMPLETE AND CORRECT

**What Was Implemented:**
- ✅ Comprehensive CSS added to `acp-chat.css` (lines 140-438)
- ✅ All data-acp-* attribute selectors correctly target acp-chat-react components
- ✅ Styling matches PROMPT requirements exactly

**Verified Implementation:**

1. **User Messages (Right-aligned bubble)**
   - ✅ Lines 167-190: `[data-acp-message-role="user"]` styled with:
     - `margin-left: auto; margin-right: 0.75rem` (right-aligned)
     - `max-width: 80%`
     - Bubble with `border-radius: 1rem 1rem 0.25rem 1rem`
     - Background: `hsl(var(--primary) / 0.42)`

2. **Agent Messages (Left-aligned, on-surface)**
   - ✅ Lines 193-224: `[data-acp-message-role="agent"]` styled with:
     - `margin-left: 1rem; margin-right: auto` (left-aligned)
     - `background: transparent` (on-surface, no bubble)
     - `padding: 0.25rem 0` (minimal padding)

3. **Thought/Tool Stacks (Left-aligned, smaller padding)**
   - ✅ Lines 227-269: `[data-acp-thought-root]` styled with:
     - `margin-left: 1rem; margin-right: 0.75rem`
     - `padding: 0.25rem 0` (smaller than messages)
     - Collapsible trigger with hover states
     - Rotate animation for expanded state (line 255)

4. **Tool Calls (Bubble with corner radius, expandable)**
   - ✅ Lines 272-366: `[data-acp-tool-call-root]` styled with:
     - `border-radius: 0.375rem` (corner radius)
     - `background: hsl(var(--card) / 0.5)`
     - `padding: 0.375rem 0.5rem`
     - Expandable with `[data-acp-tool-call-expanded="true"]` selector
     - Status icons with animations (pulse for pending/running)
     - Colors: pending (muted), running (blue), completed (green), failed (destructive)

5. **Composer Styling**
   - ✅ Lines 369-415: `[data-acp-composer]` and `[data-acp-composer-input]`
     - `border: 1px solid hsl(var(--border))`
     - `border-radius: 0.5rem`
     - `min-height: 3rem` (approximately 2 rows)
     - Focus states with `border-color: hsl(var(--primary) / 0.5)`

6. **Jump to Latest Button**
   - ✅ Lines 418-438: `[data-acp-thread-scroll-indicator]`
     - Positioned at bottom, centered horizontally
     - Proper z-index for layering
     - Hover states with background change

7. **Theme Integration**
   - ✅ All colors use `hsl(var(--...))` pattern (e.g., `hsl(var(--primary))`)
   - ✅ Matches existing agent.css conventions
   - ✅ Proper opacity modifiers (e.g., `/ 0.42`, `/ 0.5`)

**Acceptance Criteria Status:**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| User messages appear as right-aligned bubbles | ✅ PASS | Lines 167-190 |
| Agent messages appear left-aligned with no bubble (on-surface) | ✅ PASS | Lines 193-224 |
| Tool stacks are left-aligned with smaller padding than messages | ✅ PASS | Lines 227-269 |
| Individual tool calls are bubbles with corner radius | ✅ PASS | Lines 272-323 |
| Tool calls are expandable | ✅ PASS | Lines 342-344 (expand-indicator) |
| Composer textarea has border, corner radius, min 2 rows | ✅ PASS | Lines 387-405 |
| All colors use `hsl(var(--...))` pattern from theme.css | ✅ PASS | Throughout lines 140-438 |

**Code Quality Assessment:**
- ✅ CSS is well-organized with clear section comments
- ✅ All selectors correctly target data attributes from acp-chat-react
- ✅ Animations and transitions are smooth and appropriate
- ✅ Accessibility considerations (hover states, focus rings)
- ✅ No issues identified

---

## Integration Issues Summary

### Broken Integration Points

1. **AcpChat.tsx → useScrollbarFade hook (R3)**
   - Expected: Hook imported, ref created, applied to Thread container
   - Actual: Hook never imported or used
   - Result: Scrollbar fade behavior does not work

2. **AcpChat.tsx → Composer (R4)**
   - Expected: `renderSettingsRow={YmirSettingsRow}` prop passed to Composer
   - Actual: No `renderSettingsRow` prop
   - Result: Custom settings row never rendered

3. **YmirSettingsRow → SettingsRowRenderProps interface (R4)**
   - Expected: Component accepts `SettingsRowRenderProps` from acp-chat-react
   - Actual: Component uses custom `YmirSettingsRowProps` interface
   - Result: Cannot be passed as `renderSettingsRow` to Composer (type mismatch)

4. **acp-chat.css → Scrollbar selectors (R3)**
   - Expected: `.acp-thread__viewport` class exists in DOM
   - Actual: Uses `[data-acp-thread-scroll-viewport]` attribute selector
   - Result: CSS won't apply unless selector is corrected

---

## Risk Assessment

**HIGH RISK:**
- ❌ R3 (Scrollbar fade): Hook exists but is not integrated, feature completely non-functional
- ❌ R4 (Settings row): Component cannot be used with Composer due to wrong props interface
- ❌ Data flow broken: Composer cannot pass settings data to custom row

**MEDIUM RISK:**
- ⚠️ R3 CSS selector mismatch: May prevent scrollbar from fading even if hook is integrated
- ⚠️ R4 data source mismatch: Uses Ymir store instead of acp-chat-react store, breaking integration
- ⚠️ No testing or verification of the implementations

**LOW RISK:**
- ✅ R5 (Styling): No risks, implementation is complete and correct
- ✅ Hook implementation (R3): Code is correct, just not integrated

---

## Recommendations

### Immediate Actions Required:

**For R3 (Scrollbar fade):**

1. **Integrate useScrollbarFade into AcpChat.tsx:**
   ```tsx
   import { useScrollbarFade } from '../../hooks/useScrollbarFade';

   export function AcpChat({...}) {
     const threadContainerRef = useRef<HTMLDivElement>(null);
     
     useScrollbarFade(threadContainerRef);
     
     return (
       <div className="acp-chat-container" ref={threadContainerRef}>
         <Thread ... />
       </div>
     );
   }
   ```

2. **Fix CSS selector mismatch in acp-chat.css:**
   - Change `.acp-thread__viewport` to `[data-acp-thread-scroll-viewport]` (lines 441, 446, 450, 455)
   - OR: Add `.acp-thread__viewport` class to the viewport element via Composer/Thread props

**For R4 (Settings row):**

1. **Redo YmirSettingsRow to use SettingsRowRenderProps:**
   ```tsx
   import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';

   export function YmirSettingsRow(props: SettingsRowRenderProps) {
     const { modes, models, sessions, selectedModeId, selectedModelId,
             selectedSessionId, onModeChange, onModelChange, onSessionChange, disabled } = props;
     
     // Render selects using data from props, not from Ymir store
   }
   ```

2. **Add renderSettingsRow to Composer in AcpChat.tsx:**
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

3. **Remove Ymir-specific data access:**
   - Remove `useStore` calls for `agentSessions` and `acpAccumulator`
   - Use `modes`, `models`, `sessions` from `SettingsRowRenderProps` instead
   - Remove `worktreeId`, `currentAgentType`, `onConfigChange`, `onAgentChange` props
   - Rely on acp-chat-react to populate the settings data

4. **Update SessionSelector to work with SessionItem interface:**
   - Current implementation expects Ymir agent sessions
   - New implementation will receive `SessionItem[]` from acp-chat-react
   - SessionItem has: `sessionId`, `cwd`, `title`, `updatedAt`, `_meta`
   - May need to adapt to display agent names instead of session IDs

### Alternative Approach (if Ymir store integration is required):

If the Ymir-specific implementation was intentional (not a mistake), then:
1. The `YmirSettingsRow` component cannot be passed as `renderSettingsRow` to Composer
2. It must be rendered separately below the Composer
3. AcpChat.tsx would need to be restructured:
   ```tsx
   <div className="acp-chat-container">
     <Thread ... />
     <Composer ... />
     <YmirSettingsRow ... /> {/* Custom row below Composer */}
   </div>
   ```
4. This approach deviates from the specification but may be acceptable if documented

---

## Conclusion

**R5 (CSS Styling):** ✅ **COMPLETE** - Ready for production

**R3 (Scrollbar fade):** ❌ **INCOMPLETE** - Hook exists but is not integrated

**R4 (Settings row):** ❌ **INCORRECT** - Implementation does not match specification

**Overall Status:** **BLOCKED** - Cannot merge until R3 and R4 are corrected

The CSS implementation (R5) is excellent and follows the specification perfectly. However, R3 and R4 have critical issues that prevent them from functioning:

1. **R3**: The useScrollbarFade hook is created but never used in AcpChat.tsx. The feature will not work at all.

2. **R4**: The YmirSettingsRow component does not accept the SettingsRowRenderProps interface required by Composer. It uses a custom props interface and pulls data from Ymir's Zustand store instead of accepting data from acp-chat-react. This breaks the integration with the Composer component.

**Status: REQUIRES REWORK** - Both R3 and R4 must be corrected before these runes can be considered complete.

---

## Reviewer Notes

This review covers runes bf-2cb9.2.1 (R3), bf-2cb9.2.2 (R4), and bf-2cb9.2.3 (R5).

The implementation approach taken for R4 suggests a misunderstanding of the acp-chat-react architecture. The Composer component is designed to manage settings data internally and pass it to a custom render function via the `renderSettingsRow` prop. The custom component should receive the data via `SettingsRowRenderProps`, not fetch it independently from a store.

The current YmirSettingsRow implementation appears to be designed for a different component structure where:
- The parent component fetches settings data
- The parent component passes callbacks to handle changes
- The settings row is rendered separately from the Composer

This is a valid pattern in general, but it does not match the specification for this rune, which explicitly states to use the `renderSettingsRow` prop with the `SettingsRowRenderProps` interface.

---

## Appendix: Detailed Code Analysis

### R3 useScrollbarFade Hook Analysis

**File:** `/root/ymir/apps/web/src/hooks/useScrollbarFade.ts`

**Implementation:**
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

**Analysis:**
- ✅ Correct timeout: 5000ms
- ✅ Proper class toggling: adds `scrollbar-visible`, removes it
- ✅ Proper cleanup: removes event listeners and clears timer
- ✅ Uses useCallback correctly (dependencies array is correct)
- ✅ Null checking: handles missing ref element gracefully
- ✅ No memory leaks: all resources cleaned up

**Verdict:** Implementation is correct and follows best practices. The only issue is that it's never used.

### R4 YmirSettingsRow Component Analysis

**File:** `/root/ymir/apps/web/src/components/agent/YmirSettingsRow.tsx`

**Current Props Interface:**
```typescript
interface YmirSettingsRowProps {
  worktreeId: string;
  currentAgentType: string;
  onConfigChange: (configId: string, value: string) => void;
  onAgentChange: (agentType: string) => void;
}
```

**Required Props Interface (per spec):**
```typescript
import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';

// SettingsRowRenderProps contains:
interface SettingsRowRenderProps {
  modes: AcpMode[];                    // Already populated by Composer
  models: AcpModel[];                  // Already populated by Composer
  sessions: SessionItem[];             // Already populated by Composer
  selectedModeId: string | undefined;  // Already populated by Composer
  selectedModelId: string | undefined;  // Already populated by Composer
  selectedSessionId: string | undefined;// Already populated by Composer
  onModeChange: (mode: AcpMode) => void;      // Already provided by Composer
  onModelChange: (model: AcpModel) => void;    // Already provided by Composer
  onSessionChange: (session: SessionItem) => void; // Already provided by Composer
  disabled: boolean;                   // Already provided by Composer
}
```

**Data Flow Difference:**

**Current Implementation:**
```
YmirSettingsRow
  ↓ (useStore)
Ymir Zustand store (agentSessions, acpAccumulator)
  ↓
Manually extracts config options from acpAccumulator.threads[worktreeId].configOptions
  ↓
Renders selects with this data
  ↓
Changes go to parent via onConfigChange/onAgentChange
```

**Specified Implementation:**
```
Composer (from acp-chat-react)
  ↓ (populates via SessionController)
SettingsRowRenderProps (modes, models, sessions, selected*, on*Change, disabled)
  ↓
YmirSettingsRow (receives as props)
  ↓
Renders selects with this data
  ↓
Changes go back to Composer via onModeChange/onModelChange/onSessionChange
```

**Why the Current Approach Doesn't Work with renderSettingsRow:**
1. The Composer component internally populates `SettingsRowRenderProps`
2. It expects the render function to accept these props
3. The current YmirSettingsRow expects completely different props
4. Type mismatch prevents passing it as `renderSettingsRow`
5. Even if coerced (with `any`), the callbacks wouldn't work (different signatures)

**Verdict:** The current implementation is a complete mismatch with the specification. It must be rewritten to accept `SettingsRowRenderProps`.

### R5 CSS Analysis

**File:** `/root/ymir/apps/web/src/components/agent/acp-chat.css`

**Selector Pattern:**
All R5 CSS correctly uses `[data-acp-*]` attribute selectors, which is the proper way to style acp-chat-react components.

**Example: User Message Bubble**
```css
.ymir-agent-thread [data-acp-message-role="user"] {
  margin-left: auto;
  margin-right: 0.75rem;
  max-width: 80%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.ymir-agent-thread [data-acp-message-role="user"].acp-message {
  background: hsl(var(--primary) / 0.42);
  padding: 0.5rem 0.75rem;
  border-radius: 1rem 1rem 0.25rem 1rem;
  backdrop-filter: blur(8px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```

**Verdict:** CSS implementation is complete, correct, and follows all best practices.

---

## Dependencies Check

### Rune R3 Dependencies:
- ✅ Rune R1 (AcpChat rewrite) - Complete (bf-2cb9.1.1)
- ✅ Rune R2 (AgentPane wiring) - Complete (bf-2cb9.1.2)

### Rune R4 Dependencies:
- ✅ Rune R1 (AcpChat rewrite) - Complete (bf-2cb9.1.1)
- ✅ Rune R2 (AgentPane wiring) - Complete (bf-2cb9.1.2)

### Rune R5 Dependencies:
- ✅ Rune R1 (AcpChat rewrite) - Complete (bf-2cb9.1.1)

**Status:** All dependencies are complete. R3, R4, and R5 can be implemented in any order, and R5 is already complete.
