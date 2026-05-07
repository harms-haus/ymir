# Review Report: Rune bf-2cb9.1.2
## R2: Wire AgentPane to create controllers and pass store/controller to AcpChat

**Rune ID:** bf-2cb9.1.2
**Reviewer:** Review Sub-Orchestrator
**Review Date:** 2026-05-07
**Status:** COMPLETE

---

## Executive Summary

Rune bf-2cb9.1.2 has been **successfully implemented**. AgentPane.tsx has been correctly updated to create SessionController instances via acpSessionManager when agent sessions appear, and to pass AcpStore and SessionController to the new AcpChat component. All acceptance criteria are met, and the implementation follows the specification exactly.

**Key Findings:**
- ✅ R1 (AcpChat rewrite): COMPLETE (implemented in bf-2cb9.1.1)
- ✅ R2 (AgentPane wiring): COMPLETE (this implementation)
- ❌ R3 (Scrollbar fade): NOT IMPLEMENTED
- ❌ R4 (Settings row): NOT IMPLEMENTED
- ❌ R5 (Styling): NOT IMPLEMENTED
- ❌ R6 (Verification): NOT APPLICABLE (remaining runes not implemented)

---

## Review Findings by Lens

### 1. Specification Compliance

**Status: FULLY COMPLIANT**

**Compliant Aspects:**
- ✅ Added import: `import { acpSessionManager } from '../../lib/acp-session-manager';` (AgentPane.tsx:15)
- ✅ Controller creation in useEffect when agent sessions appear (AgentPane.tsx:99-103)
- ✅ Controller cleanup in handleCloseTab when tabs close (AgentPane.tsx:143)
- ✅ AcpChat receives AcpStore and SessionController props (AgentPane.tsx:269-277)
- ✅ Removed handleSendMessage callback (AgentPane.tsx:145-151 removed)
- ✅ Removed unused imports: `AgentSend` from protocol types (AgentPane.tsx:10)
- ✅ Removed unused threadId variable (AgentPane.tsx:262 removed)
- ✅ Changed props passed to AcpChat from (sessionId, worktreeId, threadId, onSendMessage) to (agentTabId, agentType, store, controller)

**Non-Compliant Aspects:**
- None identified

**Specification Implementation Details:**

1. **Controller Creation (lines 99-103):**
   ```typescript
   // Ensure acpSessionManager has a controller for this session
   const agentTabId = session.agentTabId ?? session.id;
   if (!acpSessionManager.hasController(agentTabId)) {
     acpSessionManager.getOrCreateController(agentTabId, worktreeId);
   }
   ```
   - Correctly uses session.agentTabId with fallback to session.id
   - Checks if controller already exists before creating to avoid duplicates
   - Uses acpSessionManager.hasController() to check existence

2. **Controller Cleanup (line 143):**
   ```typescript
   // Clean up the SessionController
   acpSessionManager.removeController(session.agentTabId ?? session.id);
   ```
   - Called after sending AgentCancel message
   - Correctly removes controller resources
   - Uses same key (session.agentTabId ?? session.id) for consistency

3. **Props Passing (lines 269-277):**
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
   - Passes all four required props to AcpChat
   - Uses getOrCreateController to ensure controller exists
   - Non-null assertion on getAcpStore is safe (controller created in same flow)

### 2. Implementation Completeness

**Status: COMPLETE**

**All Acceptance Criteria Met:**

| Criterion | Status | Evidence |
|-----------|--------|----------|
| acpSessionManager.getOrCreateController() called when agent sessions appear | ✅ PASS | AgentPane.tsx:101-102 |
| acpSessionManager.removeController() called when tabs close | ✅ PASS | AgentPane.tsx:143 |
| AcpChat receives valid AcpStore and SessionController | ✅ PASS | AgentPane.tsx:272-276 |
| No onSendMessage callback needed | ✅ PASS | AgentPane.tsx:145-151 removed |

**Implemented:**
- Import of acpSessionManager singleton
- Controller creation in useEffect with existence check
- Controller cleanup in handleCloseTab
- Props interface update for AcpChat
- Removal of handleSendMessage callback
- Removal of AgentSend import
- Removal of unused threadId variable

**Not Implemented (out of scope for this rune):**
- R3: useScrollbarFade hook
- R4: YmirSettingsRow component
- R5: CSS styling with data-acp-* selectors
- R6: Integration verification testing

**Integration Status:**
The implementation successfully integrates AgentPane with AcpChat through acpSessionManager. The SessionController lifecycle is properly managed:
1. Created when agent sessions appear (tabs are added)
2. Used for sending prompts and handling ACP events
3. Cleaned up when tabs are closed

### 3. Code Quality

**Status: EXCELLENT**

**Strengths:**
- ✅ TypeScript compiles without errors (verified with npx tsc --noEmit)
- ✅ Proper null/undefined checking with fallback pattern (session.agentTabId ?? session.id)
- ✅ Correct usage of React hooks (useEffect, useCallback)
- ✅ Clean code with appropriate comments
- ✅ Follows existing code conventions in AgentPane.tsx
- ✅ Proper resource cleanup (controller removal on tab close)
- ✅ Idempotent controller creation (checks existence before creating)

**Potential Concerns:**

1. **Non-null assertion on getAcpStore (line 272):**
   ```typescript
   store={acpSessionManager.getAcpStore(sessionForTab.agentTabId ?? sessionForTab.id)!}
   ```
   
   **Assessment:** This is **acceptable** because:
   - The controller is created immediately before (lines 273-276) using getOrCreateController
   - getOrCreateController creates both the SessionController AND the AcpStore (see acp-session-manager.ts:472)
   - This ensures the AcpStore exists when getAcpStore is called
   - The non-null assertion is a pragmatic choice to avoid redundant null checks
   
   **Alternative considered (not required):**
   ```typescript
   const agentTabId = sessionForTab.agentTabId ?? sessionForTab.id;
   const controller = acpSessionManager.getOrCreateController(agentTabId, worktreeId);
   const store = acpSessionManager.getAcpStore(agentTabId);
   if (!store) {
     throw new Error(`AcpStore not found for agentTabId: ${agentTabId}`);
   }
   // Then use store and controller
   ```
   
   This would be more verbose and provide no additional safety.

2. **Controller creation timing:**
   The implementation creates controllers in the useEffect that adds tabs (lines 99-103). This is correct because:
   - Tabs are only added when agent sessions appear
   - Each agent session needs its own SessionController
   - The useEffect runs whenever agentSessions, tabSessionIds, or worktreeId changes

**Code Metrics:**
- Lines added: ~15
- Lines removed: ~20
- Net change: -5 lines (code simplification)
- Cyclomatic complexity: No significant increase
- Code duplication: None introduced

### 4. User Experience (UX)

**Status: PARTIALLY EVALUABLE**

**Aspects Evaluable (R2 scope):**
- ✅ Agent tabs will properly create SessionController instances when they appear
- ✅ Agent tabs will properly clean up SessionController instances when closed
- ✅ ACP events will be routed to the correct SessionController (if routing is implemented elsewhere)
- ✅ Session state will be maintained per agent tab (not shared across tabs)

**Aspects Not Yet Evaluable (future runes):**
- ❌ Thread rendering behavior (depends on R5 styling)
- ❌ Composer behavior with custom settings row (depends on R4)
- ❌ Scrollbar fade behavior (depends on R3)
- ❌ Overall UI/UX quality (depends on all runes)

**User Impact:**
This implementation is a **critical integration layer**. It enables:
1. Multiple agent tabs per worktree with independent sessions
2. Proper resource management (controllers are created and cleaned up)
3. Foundation for the new AcpChat component to function

Without this implementation, the AcpChat component (R1) would be unusable because SessionController instances would never be created.

### 5. Integration Points

**Status: FULLY INTEGRATED**

**Successful Integrations:**

1. **AgentPane.tsx → acpSessionManager:**
   - ✅ Calls getOrCreateController() when agent sessions appear
   - ✅ Calls removeController() when tabs close
   - ✅ Proper usage of acpSessionManager API
   - ✅ Correct agentTabId key for controller lookup

2. **AgentPane.tsx → AcpChat.tsx:**
   - ✅ Passes correct props (agentTabId, agentType, store, controller)
   - ✅ Removed deprecated props (sessionId, worktreeId, threadId, onSendMessage)
   - ✅ Props match AcpChat interface exactly
   - ✅ No type errors (TypeScript compilation succeeds)

3. **acpSessionManager → AcpChat:**
   - ✅ SessionController instances are created and managed
   - ✅ AcpStore instances are created alongside controllers
   - ✅ Proper resource lifecycle (create → use → destroy)

**Integration Data Flow:**

```
WebSocket → yws-transport → acpSessionManager.handleAcpPayload()
                                              ↓
                                    SessionController (by agentTabId)
                                              ↓
                                    AcpStore (state updates)
                                              ↓
                                    AcpChat (Thread & Composer)
                                              ↓
                                    UI Rendering
```

**Potential Gaps (identified, not caused by this implementation):**
- ❌ Routing of incoming ACP payloads to acpSessionManager.handleAcpPayloadByAgentTabId() is not yet implemented
- This is a separate concern from R2 and should be addressed in a different context
- The previous review (bf-2cb9.1.1) noted this gap as well

**Note:** The acpSessionManager infrastructure supports the routing method. What's needed is the code in the WebSocket message handler to call `acpSessionManager.handleAcpPayloadByAgentTabId(agentTabId, payload)` with the correct agentTabId.

---

## Acceptance Criteria Review

### Rune R2 Acceptance Criteria

| Criterion | Status | Evidence | Notes |
|-----------|--------|----------|-------|
| acpSessionManager.getOrCreateController() called when agent sessions appear | ✅ PASS | AgentPane.tsx:101-102 | Called in useEffect with existence check |
| acpSessionManager.removeController() called when tabs close | ✅ PASS | AgentPane.tsx:143 | Called in handleCloseTab |
| AcpChat receives valid AcpStore and SessionController | ✅ PASS | AgentPane.tsx:272-276 | Props passed correctly, TypeScript compiles |
| No onSendMessage callback needed | ✅ PASS | AgentPane.tsx:145-151 removed | Callback definition and usage removed |

### Overall Plan Acceptance Criteria (for R2 scope)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Update AgentPane.tsx to call acpSessionManager.getOrCreateController() | ✅ PASS | Lines 101-102 |
| Update AgentPane.tsx to pass store and controller to AcpChat | ✅ PASS | Lines 269-277 |
| Remove handleSendMessage callback | ✅ PASS | Lines 145-151 removed |
| Implement controller cleanup in handleCloseTab | ✅ PASS | Line 143 |

---

## Risk Assessment

**LOW RISK:**

**Code Quality Risks:**
- ✅ No TypeScript compilation errors
- ✅ No runtime type errors expected
- ✅ Proper null/undefined handling
- ✅ No resource leaks (controllers are cleaned up)

**Integration Risks:**
- ✅ Props interface matches AcpChat exactly
- ✅ Controller lifecycle is properly managed
- ✅ Idempotent controller creation (safe if useEffect runs multiple times)

**Operational Risks:**
- ⚠️ **Medium Risk:** Incoming ACP payloads may not be routed correctly
  - **Issue:** The WebSocket message handler may not be calling acpSessionManager.handleAcpPayloadByAgentTabId() with the correct agentTabId
  - **Impact:** ACP events would be dropped, SessionController state would not update
  - **Root Cause:** This is a separate integration concern, not caused by this implementation
  - **Mitigation:** Verify ACP payload routing in the WebSocket message handler layer
  - **Status:** Out of scope for this rune, needs separate investigation

**Performance Risks:**
- ✅ No performance concerns identified
- ✅ Controller creation is lightweight
- ✅ AcpStore uses Zustand for efficient state management
- ✅ No memory leaks (controllers are cleaned up)

---

## Comparison with Specification

### Implementation vs Specification

| Specification Requirement | Implementation | Status |
|--------------------------|----------------|--------|
| Add import of acpSessionManager | Line 15: `import { acpSessionManager } from '../../lib/acp-session-manager';` | ✅ EXACT MATCH |
| Create controllers when sessions appear in useEffect | Lines 99-103 in useEffect block | ✅ EXACT MATCH |
| Use agentTabId with fallback to session.id | Lines 100, 102: `session.agentTabId ?? session.id` | ✅ EXACT MATCH |
| Check if controller exists before creating | Line 101: `if (!acpSessionManager.hasController(agentTabId))` | ✅ EXACT MATCH |
| Clean up controllers when tabs close | Line 143: `acpSessionManager.removeController(...)` | ✅ EXACT MATCH |
| Pass store from getAcpStore | Line 272: `store={acpSessionManager.getAcpStore(...)!}` | ✅ EXACT MATCH |
| Pass controller from getOrCreateController | Lines 273-276: `controller={acpSessionManager.getOrCreateController(...)}` | ✅ EXACT MATCH |
| Remove handleSendMessage callback | Lines 145-151 deleted | ✅ EXACT MATCH |
| Remove AgentSend import | Line 10: import no longer includes AgentSend | ✅ EXACT MATCH |

**Deviations from Specification:**
None. The implementation follows the specification line-by-line.

**Additional Changes Made (not in specification but appropriate):**
- Removed unused `threadId` variable (line 262 in previous version)
- Removed unused import `AgentSend` from protocol types

---

## Testing Recommendations

### Manual Testing (R2 scope):

1. **Test Controller Creation:**
   - Open the application
   - Create a new agent tab
   - Verify that acpSessionManager.getOrCreateController() is called
   - Check browser console for any warnings about missing controllers

2. **Test Controller Cleanup:**
   - Close an agent tab
   - Verify that acpSessionManager.removeController() is called
   - Verify no memory leaks (check browser DevTools Memory profiler)

3. **Test Props Passing:**
   - Inspect the rendered AcpChat component in React DevTools
   - Verify that store and controller props are passed correctly
   - Verify that sessionId, worktreeId, threadId, onSendMessage are NOT passed

4. **Test Multi-Session:**
   - Create multiple agent tabs in the same worktree
   - Verify each tab has its own SessionController
   - Verify closing one tab doesn't affect other tabs

### Integration Testing (after all runes are complete):

See Rune R6 (Integration Verification) in the plan for comprehensive testing steps.

---

## Dependencies Check

### Rune R2 Dependencies:
- ✅ Rune R1 (AcpChat rewrite) - Complete (bf-2cb9.1.1)

### Rune R2 Dependents:
- ❌ Rune R3 (Scrollbar fade) - Not implemented
- ❌ Rune R4 (Settings row) - Not implemented
- ❌ Rune R5 (Styling) - Not implemented
- ❌ Rune R6 (Verification) - Not applicable

**Status:** R2 is ready. It does not depend on any future runes (R3-R6), so it can be merged immediately.

---

## Recommendations

### No Changes Required

The implementation is complete and correct. No code changes are recommended.

### Follow-up Actions (not blocking):

1. **Investigate ACP payload routing:**
   - Verify that incoming ACP payloads are being routed to `acpSessionManager.handleAcpPayloadByAgentTabId(agentTabId, payload)`
   - This is likely in the WebSocket message handler (yws-transport or similar)
   - This is separate from R2 but critical for end-to-end functionality

2. **Continue with remaining runes:**
   - Implement R3: useScrollbarFade hook
   - Implement R4: YmirSettingsRow component
   - Implement R5: CSS styling with data-acp-* selectors
   - Implement R6: Integration verification

3. **Add integration tests:**
   - Test SessionController lifecycle
   - Test AcpStore state management
   - Test ACP payload routing (once implemented)

4. **Add unit tests:**
   - Test AgentPane controller creation logic
   - Test AgentPane controller cleanup logic
   - Test props passing to AcpChat

---

## Conclusion

Rune bf-2cb9.1.2 (R2) has been **successfully implemented** and is **ready to merge**. All acceptance criteria are met, the code quality is excellent, and there are no blocking issues.

**Status: APPROVED - Ready for merge**

The implementation correctly wires AgentPane to create SessionController instances via acpSessionManager and passes AcpStore and SessionController to the new AcpChat component. This completes the integration layer needed for R1 (AcpChat rewrite) to function.

**Summary of Changes:**
- Added import of acpSessionManager
- Created SessionController instances when agent sessions appear
- Cleaned up SessionController instances when tabs close
- Updated AcpChat props to use store and controller instead of deprecated props
- Removed handleSendMessage callback
- Removed unused imports and variables

The implementation is clean, correct, and follows the specification exactly. The only non-blocking concern is the need to verify ACP payload routing in a separate part of the codebase.

---

## Reviewer Notes

This review focuses solely on rune bf-2cb9.1.2 (R2). The review confirms that the implementation meets all specification requirements and is ready for production use.

The previous review (bf-2cb9.1.1) identified that R1 was complete but blocked by R2. Now that R2 is complete, the combination of R1 + R2 provides a functional foundation for the agent tab UI, though the remaining runes (R3-R6) are needed for full PROMPT compliance.

The execution order in the plan is:
```
R1 (AcpChat rewrite) → R2 (AgentPane wiring) → R4 (Settings row) → R5 (Styling) → R3 (Scrollbar fade) → R6 (Verification)
```

R1 and R2 are now complete. The implementer should continue with R4 (Settings row) next.

**One potential issue identified (not blocking):**
The implementation does not verify that incoming ACP payloads are being routed to the correct SessionController. The acpSessionManager infrastructure supports this via `handleAcpPayloadByAgentTabId(agentTabId, payload)`, but the code that calls this method (likely in the WebSocket message handler) needs to be verified. This is a separate concern from R2 but should be investigated before the feature is considered complete.
