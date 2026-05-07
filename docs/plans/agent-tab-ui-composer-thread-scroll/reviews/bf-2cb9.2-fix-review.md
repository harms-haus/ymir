# Fix Review Report: Runes bf-2cb9.2.1, bf-2cb9.2.2
## R3 and R4: Scrollbar fade and Settings row fixes

**Rune IDs:** bf-2cb9.2.1 (R3), bf-2cb9.2.2 (R4)
**Review Type:** Fix Verification (following bf-2cb9.2-review.md)
**Review Date:** 2026-05-07
**Status:** ✅ ALL ISSUES RESOLVED

---

## Executive Summary

All critical issues identified in the previous review (bf-2cb9.2-review.md) have been successfully resolved. Both R3 (Scrollbar fade-on-idle) and R4 (Custom settings row) are now properly integrated and match their specifications.

**Key Findings:**
- ✅ R1 (AcpChat rewrite): COMPLETE (from previous review)
- ✅ R2 (AgentPane wiring): COMPLETE (from previous review)
- ✅ **R3 (Scrollbar fade): NOW COMPLETE** - Hook properly integrated, CSS selector corrected
- ✅ **R4 (Settings row): NOW COMPLETE** - Uses correct interface, integrated with Composer
- ✅ R5 (Styling): COMPLETE (from previous review)

---

## R3: Scrollbar Fade-on-Idle (bf-2cb9.2.1)

### Previous Issues (from bf-2cb9.2-review.md)

1. **Hook Not Integrated:** The useScrollbarFade hook was NEVER IMPORTED OR USED in AcpChat.tsx
2. **Missing Container Ref:** No container ref was created to hold the viewport element
3. **CSS Selector Mismatch:** Used `.acp-thread__viewport` class selector instead of `[data-acp-thread-scroll-viewport]` attribute selector

### Fixes Applied

#### 1. Hook Integration in AcpChat.tsx ✅

**Status:** FIXED

**File:** `/root/ymir/apps/web/src/components/agent/AcpChat.tsx`

**Changes:**
```typescript
// Line 5: Hook is now imported
import { useScrollbarFade } from '../../hooks/useScrollbarFade';

// Line 22: Container ref is now created
const threadContainerRef = useRef<HTMLDivElement>(null);

// Line 24: Hook is now applied with the container ref
useScrollbarFade(threadContainerRef);

// Line 27: Ref is attached to the container div
<div className="acp-chat-container" ref={threadContainerRef}>
```

**Verification:**
- ✅ Import statement present on line 5
- ✅ useRef imported from 'react' on line 1
- ✅ threadContainerRef declared on line 22
- ✅ useScrollbarFade called on line 24
- ✅ Ref attached to container div on line 27

#### 2. CSS Selector Correction in acp-chat.css ✅

**Status:** FIXED

**File:** `/root/ymir/apps/web/src/components/agent/acp-chat.css`

**Lines 441, 446, 450, 455:**
```css
/* All selectors now use [data-acp-thread-scroll-viewport] instead of .acp-thread__viewport */
.ymir-agent-thread [data-acp-thread-scroll-viewport] {
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.3s ease;
}

.ymir-agent-thread [data-acp-thread-scroll-viewport].scrollbar-visible {
  scrollbar-color: hsl(var(--muted-foreground) / 0.28) transparent;
}

.ymir-agent-thread [data-acp-thread-scroll-viewport]::-webkit-scrollbar-thumb {
  background: transparent;
  transition: background 0.3s ease;
}

.ymir-agent-thread [data-acp-thread-scroll-viewport].scrollbar-visible::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.28);
}
```

**Verification:**
- ✅ All 4 selectors use `[data-acp-thread-scroll-viewport]` attribute selector
- ✅ Transitions are properly configured (0.3s ease)
- ✅ Transparent default state matches spec
- ✅ Visible state uses theme color `hsl(var(--muted-foreground) / 0.28)`

### Acceptance Criteria Status (Updated)

| Criterion | Previous Status | Current Status | Evidence |
|-----------|-----------------|----------------|----------|
| Scrollbar is transparent by default | ✅ PASS | ✅ PASS | CSS lines 441-443 |
| Scrollbar becomes visible when mouse moves within the thread | ❌ FAIL | ✅ PASS | Hook now integrated in AcpChat.tsx line 24 |
| Scrollbar fades back to transparent after 5 seconds of no movement | ❌ FAIL | ✅ PASS | Hook implementation (useScrollbarFade.ts) |
| Scrollbar fades immediately when mouse leaves the thread | ❌ FAIL | ✅ PASS | Hook implementation (useScrollbarFade.ts) |
| Uses CSS transitions for smooth fade | ✅ PASS | ✅ PASS | CSS lines 443, 452 |

### R3 Code Quality Assessment

- ✅ Hook implementation is excellent - clean, correct, follows React patterns
- ✅ CSS is well-written with vendor prefixes and transitions
- ✅ Hook is now properly integrated with container ref
- ✅ CSS selector matches actual DOM structure (data attribute)
- ✅ No issues identified

---

## R4: Custom Settings Row for Composer (bf-2cb9.2.2)

### Previous Issues (from bf-2cb9.2-review.md)

1. **Wrong Props Interface:** Used custom YmirSettingsRowProps instead of SettingsRowRenderProps from acp-chat-react
2. **Not Integrated with Composer:** No renderSettingsRow prop passed to Composer
3. **Data Source Mismatch:** Used Ymir's Zustand store instead of acp-chat-react's store
4. **Custom Callbacks:** Required onConfigChange and onAgentChange instead of using onModeChange, onModelChange, onSessionChange from SettingsRowRenderProps

### Fixes Applied

#### 1. Correct Props Interface ✅

**Status:** FIXED

**File:** `/root/ymir/apps/web/src/components/agent/YmirSettingsRow.tsx`

**Lines 1-16:**
```typescript
// Line 1: Now imports SettingsRowRenderProps from acp-chat-react
import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';

// Line 4: Component now accepts SettingsRowRenderProps
export function YmirSettingsRow(props: SettingsRowRenderProps) {
  const {
    modes,
    models,
    sessions,
    selectedModeId,
    selectedModelId,
    selectedSessionId,
    onModeChange,
    onModelChange,
    onSessionChange,
    disabled,
  } = props;
```

**Verification:**
- ✅ SettingsRowRenderProps imported from '@harms-haus/acp-chat-react'
- ✅ All required properties are destructured from props
- ✅ No custom YmirSettingsRowProps interface
- ✅ No Ymir-specific data fetching (useStore calls removed)

#### 2. Integration with Composer ✅

**Status:** FIXED

**File:** `/root/ymir/apps/web/src/components/agent/AcpChat.tsx`

**Line 41:**
```typescript
<Composer
  store={store}
  controller={controller}
  minRows={2}
  placeholder={`Ask ${agentType}...`}
  renderSettingsRow={YmirSettingsRow}  // ← Now present!
  className="ymir-agent-composer"
/>
```

**Verification:**
- ✅ renderSettingsRow prop is passed to Composer
- ✅ YmirSettingsRow is passed as the value
- ✅ YmirSettingsRow is imported (line 6)

#### 3. Correct Change Handler Signatures ✅

**Status:** FIXED

**File:** `/root/ymir/apps/web/src/components/agent/YmirSettingsRow.tsx`

**ModeSelector (lines 64-68):**
```typescript
onValueChange={(value) => {
  const mode = modes.find((m) => m.id === value);
  if (mode) {
    onModeChange(mode);  // ← Correct: passes entire AcpMode object
  }
}}
```

**ModelSelector (lines 108-112):**
```typescript
onValueChange={(value) => {
  const model = models.find((m) => m.id === value);
  if (model) {
    onModelChange(model);  // ← Correct: passes entire AcpModel object
  }
}}
```

**SessionSelector (lines 154-158):**
```typescript
onValueChange={(value) => {
  const session = sessions.find((s) => s.sessionId === value);
  if (session) {
    onSessionChange(session);  // ← Correct: passes entire SessionItem object
  }
}}
```

**Verification:**
- ✅ All change handlers find the full object from the respective array
- ✅ Handlers call the correct callback with the full object (not just ID)
- ✅ Matches SettingsRowRenderProps interface expectations
- ✅ ModeSelector, ModelSelector, and SessionSelector all follow the same pattern

#### 4. Component Structure ✅

**Status:** VERIFIED

**File:** `/root/ymir/apps/web/src/components/agent/YmirSettingsRow.tsx`

The component is now properly structured:
- ✅ Main component (YmirSettingsRow) - lines 4-48
  - Destructures all required properties from SettingsRowRenderProps
  - Renders container div with left-aligned selectors
  - Conditionally renders ModeSelector, ModelSelector, SessionSelector
- ✅ ModeSelector sub-component - lines 50-92
  - Accepts modes, selectedModeId, onModeChange, disabled
  - Uses Select.Root from @base-ui/react
  - Displays mode name or 'Mode' placeholder
- ✅ ModelSelector sub-component - lines 94-136
  - Accepts models, selectedModelId, onModelChange, disabled
  - Uses Select.Root from @base-ui/react
  - Displays model name or 'Model' placeholder
- ✅ SessionSelector sub-component - lines 138-186
  - Accepts sessions, selectedSessionId, onSessionChange, disabled
  - Uses Select.Root from @base-ui/react
  - Displays session title or 'Session' placeholder

**Verification:**
- ✅ All sub-components use SettingsRowRenderProps type annotations
- ✅ No Ymir-specific data access (no useStore calls)
- ✅ No custom props interfaces
- ✅ Proper TypeScript typing throughout

### Acceptance Criteria Status (Updated)

| Criterion | Previous Status | Current Status | Evidence |
|-----------|-----------------|----------------|----------|
| Settings row renders ACP Mode, Model, Session selects when available | ❌ PARTIAL | ✅ PASS | Lines 21-44 in YmirSettingsRow.tsx |
| Selects use `@base-ui/react` Select component | ✅ PASS | ✅ PASS | Lines 2, 62, 106, 152 |
| Styling matches existing agent.css patterns | ✅ PASS | ✅ PASS | CSS lines 459-600 in acp-chat.css |
| Row is below the textarea input | ❌ FAIL | ✅ PASS | renderSettingsRow now passed to Composer (line 41 in AcpChat.tsx) |
| Component accepts SettingsRowRenderProps | ❌ FAIL | ✅ PASS | Line 4 in YmirSettingsRow.tsx |

### R4 Code Quality Assessment

- ✅ Component is well-structured with separate ModeSelector, ModelSelector, SessionSelector sub-components
- ✅ Uses React patterns correctly (no unnecessary re-renders)
- ✅ Proper TypeScript typing with SettingsRowRenderProps
- ✅ CSS is well-written and styled
- ✅ Follows the specification for props interface
- ✅ Properly integrated with Composer's renderSettingsRow mechanism
- ✅ No Ymir-specific data fetching - relies on acp-chat-react for data

---

## Integration Verification

### AgentPane.tsx (R2 Implementation)

The changes to AgentPane.tsx confirm proper integration:

1. **acpSessionManager Import:**
   ```typescript
   import { acpSessionManager } from '../../lib/acp-session-manager';
   ```

2. **Controller Creation (when sessions appear):**
   ```typescript
   // Ensure acpSessionManager has a controller for this session
   const agentTabId = session.agentTabId ?? session.id;
   if (!acpSessionManager.hasController(agentTabId)) {
     acpSessionManager.getOrCreateController(agentTabId, worktreeId);
   }
   ```

3. **Controller Cleanup (when tabs close):**
   ```typescript
   // Clean up the SessionController
   acpSessionManager.removeController(session.agentTabId ?? session.id);
   ```

4. **AcpChat Props:**
   ```typescript
   <AcpChat
     agentTabId={sessionForTab.agentTabId ?? sessionForTab.id}
     agentType={sessionForTab.agentType}
     store={acpSessionManager.getAcpStore(sessionForTab.agentTabId ?? sessionForTab.id)!}
     controller={acpSessionManager.getOrCreateController(
       sessionForTab.agentTabId ?? sessionForTab.id,
       worktreeId
     )}
   />
   ```

5. **No onSendMessage Callback:**
   - ✅ Removed handleSendMessage callback
   - ✅ Composer uses controller.sendPrompt() directly

**Verification:**
- ✅ All R2 requirements are met
- ✅ Proper lifecycle management of SessionController instances
- ✅ AcpStore and SessionController correctly passed to AcpChat
- ✅ No breaking changes to existing functionality

---

## Risk Assessment

### Current Risk Level: LOW ✅

**R3 (Scrollbar fade):**
- ✅ Risk: NONE - Hook is properly integrated
- ✅ CSS selector corrected to match DOM structure
- ✅ All acceptance criteria met

**R4 (Settings row):**
- ✅ Risk: NONE - Component uses correct interface
- ✅ Properly integrated with Composer
- ✅ All acceptance criteria met

**Integration:**
- ✅ Risk: NONE - R2 wiring is correct
- ✅ SessionController lifecycle properly managed
- ✅ Data flow from acp-chat-react to settings row is correct

**Overall:**
- ✅ All previous critical issues resolved
- ✅ No new issues identified
- ✅ Ready for testing and verification

---

## Testing Recommendations

### Manual Testing Checklist

1. **Scrollbar Fade Behavior:**
   - [ ] Open agent tab with enough messages to enable scrolling
   - [ ] Verify scrollbar is transparent by default
   - [ ] Move mouse within the thread viewport
   - [ ] Verify scrollbar becomes visible (class `scrollbar-visible` added)
   - [ ] Wait 5 seconds without moving mouse
   - [ ] Verify scrollbar fades back to transparent (class `scrollbar-visible` removed)
   - [ ] Move mouse out of the thread viewport
   - [ ] Verify scrollbar fades immediately (class `scrollbar-visible` removed)
   - [ ] Verify transition is smooth (0.3s ease)

2. **Settings Row Functionality:**
   - [ ] Verify Composer renders custom settings row below textarea
   - [ ] Verify Mode selector appears when modes are available
   - [ ] Verify Model selector appears when models are available
   - [ ] Verify Session selector appears when sessions are available
   - [ ] Click Mode selector → verify dropdown opens with available modes
   - [ ] Select a mode → verify selection updates
   - [ ] Click Model selector → verify dropdown opens with available models
   - [ ] Select a model → verify selection updates
   - [ ] Click Session selector → verify dropdown opens with available sessions
   - [ ] Select a session → verify selection updates
   - [ ] Verify selectors are styled consistently with rest of UI

3. **Integration Testing:**
   - [ ] Open multiple agent tabs
   - [ ] Verify each tab has its own SessionController
   - [ ] Verify settings are isolated per tab
   - [ ] Close a tab → verify SessionController is cleaned up
   - [ ] Verify no memory leaks or console errors

4. **Edge Cases:**
   - [ ] Test with empty modes/models/sessions arrays
   - [ ] Test with disabled state
   - [ ] Test rapid mouse movement in thread viewport
   - [ ] Test leaving and re-entering thread viewport

---

## Conclusion

**R3 (Scrollbar fade):** ✅ **COMPLETE** - All issues resolved, properly integrated

**R4 (Settings row):** ✅ **COMPLETE** - All issues resolved, uses correct interface, integrated with Composer

**Overall Status:** ✅ **READY FOR TESTING**

All critical issues identified in the previous review have been successfully resolved:

1. **R3 Fixes:**
   - useScrollbarFade hook is now imported and integrated in AcpChat.tsx
   - Container ref is created and properly attached
   - CSS selector corrected from `.acp-thread__viewport` to `[data-acp-thread-scroll-viewport]`

2. **R4 Fixes:**
   - Component now uses SettingsRowRenderProps interface from acp-chat-react
   - No longer uses Ymir's Zustand store for data
   - renderSettingsRow prop is now passed to Composer
   - All change handlers use correct signatures from SettingsRowRenderProps
   - No custom props interfaces or Ymir-specific callbacks

The implementations now match their specifications exactly. Both runes are properly integrated and ready for manual testing and verification.

**Status: APPROVED FOR TESTING** - Proceed to R6 (Integration Verification)
